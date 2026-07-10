import { apiBase, getAccessToken, type ApiResult } from "../../../shared/api";
import type { RfqOcrPage, RfqOcrProgress } from "./rfqDocumentOcr";

export type ServerPdfExtractResult = {
  pages: RfqOcrPage[];
  total_pages: number;
  skipped_pages: number;
  extracted_pages: number;
  empty_text_pages?: number;
  text_only?: boolean;
};

export async function extractPdfOnServer(
  file: File,
  options: {
    pageFrom?: number;
    pageTo?: number;
    filterNonTablePages?: boolean;
  },
  onProgress?: (p: RfqOcrProgress) => void,
): Promise<{ pages: RfqOcrPage[]; skippedPages: number; totalPages: number; emptyTextPages: number }> {
  onProgress?.({
    phase: "parse",
    page: 0,
    totalPages: 0,
    message: `Uploading ${file.name} for server extraction…`,
  });

  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  if (options.pageFrom) fd.append("page_from", String(options.pageFrom));
  if (options.pageTo) fd.append("page_to", String(options.pageTo));
  fd.append("filter_non_table", options.filterNonTablePages === false ? "0" : "1");

  const base = apiBase || "";
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/quotation/rfq-import/extract-pdf`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
  } catch {
    throw new Error("Could not reach the API for server PDF extraction.");
  }

  const body = (await res.json()) as ApiResult<ServerPdfExtractResult>;
  if (!body.success || !body.data?.pages) {
    throw new Error(body.message ?? body.errors?.file ?? "Server PDF extraction failed.");
  }

  onProgress?.({
    phase: "parse",
    page: body.data.extracted_pages,
    totalPages: body.data.extracted_pages,
    message: `Server extracted ${body.data.extracted_pages} table page(s) from ${body.data.total_pages} total.`,
  });

  return {
    pages: body.data.pages,
    skippedPages: body.data.skipped_pages ?? 0,
    totalPages: body.data.total_pages,
    emptyTextPages: body.data.empty_text_pages ?? 0,
  };
}
