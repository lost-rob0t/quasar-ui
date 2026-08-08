import {
  fetchMelissaDirect,
  inspectMelissaLicenseKey,
  normalizeMelissaLicenseKey
} from "./melissa-browser-config";

export const MELISSA_PERSONATOR_TEST_RECORD = Object.freeze({
  full: "Melissa Data",
  address1: "22382 Avenida Empresa",
  city: "Rancho Santa Margarita",
  state: "CA",
  postal: "92688"
});

const MELISSA_TRANSMISSION_ERRORS = Object.freeze({
  GE01: {
    message: "Empty request structure",
    remediation: "Check that the request body or query parameters were created correctly."
  },
  GE04: {
    message: "Empty license key",
    remediation: "Paste the Melissa License Key Using Credits before testing."
  },
  GE05: {
    message: "Invalid license key",
    remediation: "Verify that the saved value is the exact License Key Using Credits."
  },
  GE06: {
    message: "Disabled license key",
    remediation: "Re-enable the key in Melissa or replace it with an active key."
  },
  GE07: {
    message: "Invalid request",
    remediation: "Inspect the request parameters and Melissa endpoint requirements."
  },
  GE08: {
    message: "Product or account level not enabled",
    remediation:
      "Enable Personator Search for this Melissa account or use a license key entitled for Personator Search."
  },
  GE09: {
    message: "Customer does not exist",
    remediation: "Verify the Melissa account associated with the license key."
  },
  GE10: {
    message: "Customer license disabled",
    remediation: "Contact Melissa to restore or replace the disabled customer license."
  },
  GE14: {
    message: "Out of credits",
    remediation: "Add credits to the Melissa account before retrying."
  },
  SE01: {
    message: "Melissa Cloud API internal error",
    remediation: "Retry later and contact Melissa support if the error persists."
  }
});

function keyFingerprint(value) {
  let state = 0x811c9dc5;
  for (const character of value) {
    state ^= character.codePointAt(0);
    state = Math.imul(state, 0x01000193);
  }
  return (state >>> 0).toString(16).padStart(8, "0");
}

function writeLog(logger, level, message, details) {
  const sink = logger?.[level] || logger?.log;
  if (typeof sink === "function") sink.call(logger, message, details);
}

function errorDetails(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    stack: error?.stack || ""
  };
}

export function describeMelissaTransmissionError(code) {
  const normalized = String(code || "").trim().toUpperCase();
  return (
    MELISSA_TRANSMISSION_ERRORS[normalized] || {
      message: normalized ? `Unrecognized Melissa transmission error ${normalized}` : "",
      remediation: normalized
        ? "Inspect Melissa's current Personator Search result-code documentation."
        : ""
    }
  );
}

export function describeMelissaLicenseKey(value) {
  const licenseKey = normalizeMelissaLicenseKey(value);
  return {
    ...inspectMelissaLicenseKey(licenseKey),
    ending: licenseKey ? licenseKey.slice(-4) : "",
    fingerprint: licenseKey ? keyFingerprint(licenseKey) : "",
    sentUnchanged: true
  };
}

export function buildMelissaPersonatorTestUrl(licenseKey, record = MELISSA_PERSONATOR_TEST_RECORD) {
  const exact = normalizeMelissaLicenseKey(licenseKey);
  if (!exact) throw new Error("Paste the Melissa License Key Using Credits before testing");

  const url = new URL("https://personatorsearch.melissadata.net/WEB/doPersonatorSearch");
  url.searchParams.set("id", exact);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("t", "Quasar manual credential test");
  url.searchParams.set("full", String(record.full || ""));
  url.searchParams.set("a1", String(record.address1 || ""));
  url.searchParams.set("city", String(record.city || ""));
  url.searchParams.set("state", String(record.state || ""));
  url.searchParams.set("postal", String(record.postal || ""));
  return url;
}

function transmissionCodes(value) {
  return String(value || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

export async function testMelissaPersonatorSearch(
  licenseKey,
  {
    fetchImpl = fetchMelissaDirect,
    record = MELISSA_PERSONATOR_TEST_RECORD,
    logger = console
  } = {}
) {
  if (typeof fetchImpl !== "function") throw new Error("Browser fetch is unavailable");

  const url = buildMelissaPersonatorTestUrl(licenseKey, record);
  const endpoint = `${url.origin}${url.pathname}`;
  const key = describeMelissaLicenseKey(licenseKey);
  const startedAt = Date.now();

  writeLog(logger, "info", "[Melissa Personator Test] request", {
    method: "GET",
    endpoint,
    sample: { ...record },
    key
  });

  try {
    const response = await fetchImpl(url.href, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "omit",
      cache: "no-store"
    });
    const raw = await response.text();
    const responseMeta = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType: response.headers?.get?.("content-type") || "",
      bodyCharacters: raw.length,
      elapsedMs: Date.now() - startedAt
    };

    writeLog(logger, "info", "[Melissa Personator Test] response", responseMeta);

    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      const error = new Error(
        `Melissa returned non-JSON HTTP ${response.status}: ${raw.slice(0, 160)}`
      );
      error.response = { ...responseMeta, bodyPreview: raw.slice(0, 500) };
      throw error;
    }

    writeLog(logger, "info", "[Melissa Personator Test] response body", body);

    const transmissionResults = String(
      body?.TransmissionResults || body?.TransmissionResult || ""
    ).trim();
    const errorCode = transmissionCodes(transmissionResults).find((code) =>
      /^(?:GE|SE)\d{2}$/.test(code)
    );
    const records = Array.isArray(body?.Records) ? body.Records : [];
    const error = errorCode ? describeMelissaTransmissionError(errorCode) : null;
    const result = {
      ok: response.ok && !errorCode,
      httpStatus: response.status,
      transmissionResults: transmissionResults || "(missing)",
      transmissionReference: String(body?.TransmissionReference || ""),
      errorCode: errorCode || "",
      errorMessage: error?.message || "",
      remediation: error?.remediation || "",
      totalPages: Number(body?.TotalPages) || 0,
      totalRecords: Number(body?.TotalRecords ?? records.length) || 0,
      returnedRecordObjects: records.length,
      version: String(body?.Version || ""),
      key,
      endpoint,
      sample: { ...record }
    };

    writeLog(
      logger,
      result.ok ? "info" : "warn",
      result.ok
        ? "[Melissa Personator Test] credential accepted"
        : "[Melissa Personator Test] credential rejected",
      result
    );

    return result;
  } catch (error) {
    writeLog(logger, "error", "[Melissa Personator Test] failed", {
      endpoint,
      elapsedMs: Date.now() - startedAt,
      key,
      response: error?.response || null,
      error: errorDetails(error)
    });
    throw error;
  }
}
