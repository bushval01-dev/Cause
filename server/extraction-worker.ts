import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PDFParse } from "pdf-parse";
import { simpleParser } from "mailparser";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
const require = createRequire(import.meta.url);
process.once("message", async (job: any) => {
  let ocr: any;
  try {
    const data = readFileSync(job.path);
    const recognize = async (image: any) => {
      ocr ??= await createWorker("eng", 1, {
        langPath: require("@tesseract.js-data/eng").langPath,
        cacheMethod: "none",
        gzip: true,
        logger: () => {},
      });
      const prepared = await sharp(image, { limitInputPixels: 20000000 })
        .rotate()
        .resize({
          width: 1600,
          height: 2200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .greyscale()
        .png()
        .toBuffer();
      const { data } = await ocr.recognize(prepared);
      return { text: data.text, confidence: data.confidence };
    };
    let pages: any[] = [],
      method = "text";
    let attachments: any[] = [];
    if (job.mime === "application/pdf") {
      const pdf = new PDFParse({ data });
      try {
        const result = await pdf.getText();
        if (result.pages.length > 500)
          throw Error("PDF page limit exceeded (500)");
        pages = result.pages.map((p) => ({
          number: p.num,
          text: p.text,
          method: "pdf-text",
        }));
        const empty = pages.filter(
          (p) =>
            p.text.replace(/--\s*\d+\s+of\s+\d+\s*--/g, "").trim().length < 10,
        );
        if (empty.length > 20)
          throw Error(
            "Scanned PDF limit exceeded (20 scanned pages per upload)",
          );
        const info = empty.length
          ? await pdf.getInfo({ parsePageInfo: true })
          : null;
        for (const page of empty) {
          const size = info?.pages.find((p) => p.pageNumber === page.number);
          if (
            size &&
            (!size.width ||
              !size.height ||
              size.height / size.width > 8 ||
              size.width / size.height > 8)
          )
            throw Error("PDF page dimensions exceed supported bounds");
          const shot = await pdf.getScreenshot({
            partial: [page.number],
            desiredWidth: 1600,
            imageDataUrl: false,
          });
          if (shot.pages[0]) {
            const read = await recognize(Buffer.from(shot.pages[0].data));
            Object.assign(page, read, { method: "ocr" });
          }
        }
        method = empty.length ? "pdf-text-and-ocr" : "pdf-text";
      } finally {
        await pdf.destroy();
      }
    } else if (job.mime.startsWith("image/")) {
      pages = [{ number: 1, ...(await recognize(data)), method: "ocr" }];
      method = "ocr";
    } else if (job.name.toLowerCase().endsWith(".eml")) {
      const message = await simpleParser(data, { skipHtmlToText: false });
      const headers = [
        `From: ${message.from?.text || ""}`,
        `To: ${Array.isArray(message.to) ? message.to.map((a) => a.text).join(", ") : message.to?.text || ""}`,
        `Subject: ${message.subject || ""}`,
        `Date: ${message.date?.toISOString() || ""}`,
      ].join("\n");
      pages = [
        {
          number: 1,
          text:
            headers +
            "\n\n" +
            (message.text ||
              (!message.subject && !message.from ? data.toString("utf8") : "")),
          method: "mime-decoded",
        },
      ];
      attachments = message.attachments.map((a) => ({
        name: a.filename || "attachment",
        mime: a.contentType,
        size: a.size,
      }));
      method = "mime-decoded";
    } else {
      const text = data.toString("utf8");
      if (text.includes("\u0000"))
        throw Error("Binary content cannot be imported as text");
      pages = [{ number: 1, text, method: "text" }];
    }
    if (pages.reduce((sum, p) => sum + p.text.length, 0) > 2000000)
      throw Error("Extracted text limit exceeded (2 million characters)");
    process.send?.({ pages, method, attachments });
  } catch (e: any) {
    process.send?.({ error: e.message });
  } finally {
    await ocr?.terminate();
    process.disconnect?.();
  }
});
