const DEFAULT_MAX_JSON_BODY_BYTES = 64 * 1024;

const parseContentLength = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const concatChunks = (chunks, totalLength) => {
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
};

export const readJsonBody = async (
  request,
  { maxBytes = DEFAULT_MAX_JSON_BODY_BYTES, emptyValue = null } = {},
) => {
  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > maxBytes) {
    return { ok: false, status: 413, error: "Payload demasiado grande." };
  }

  if (!request.body) {
    return { ok: true, data: emptyValue };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: "Payload demasiado grande." };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "No se pudo leer el payload." };
  }

  const text = new TextDecoder().decode(concatChunks(chunks, received)).trim();
  if (!text) {
    return { ok: true, data: emptyValue };
  }

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Payload JSON invalido." };
  }
};
