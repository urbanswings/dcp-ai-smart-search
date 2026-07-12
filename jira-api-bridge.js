require("dotenv/config");

const http = require("http");
const { URL } = require("url");
const axios = require("axios");

const PORT = Number(process.env.JIRA_BRIDGE_PORT || 8787);
const JIRA_BASE_URL = String(process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
const JIRA_API_TOKEN = String(process.env.JIRA_API_TOKEN || "").trim();
const JIRA_AUTH_TYPE = String(process.env.JIRA_AUTH_TYPE || "bearer").trim().toLowerCase();
const JIRA_USER_EMAIL = String(process.env.JIRA_USER_EMAIL || "").trim();
const JIRA_AFFECTED_MARKETS_FIELD = String(process.env.JIRA_AFFECTED_MARKETS_FIELD || "").trim();
const JIRA_AFFECTED_MARKETS_MODE = String(process.env.JIRA_AFFECTED_MARKETS_MODE || "string").trim().toLowerCase();
const JIRA_ASSIGNEE_FIELD_MODE = String(process.env.JIRA_ASSIGNEE_FIELD_MODE || "name").trim().toLowerCase();

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getAuthHeaders() {
  if (!JIRA_API_TOKEN) {
    throw new Error("JIRA_API_TOKEN is not set.");
  }

  if (JIRA_AUTH_TYPE === "basic") {
    if (!JIRA_USER_EMAIL) {
      throw new Error("JIRA_USER_EMAIL is required when JIRA_AUTH_TYPE=basic.");
    }
    const encoded = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }

  return { Authorization: `Bearer ${JIRA_API_TOKEN}` };
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) {
    return [];
  }
  return [...new Set(labels.map((label) => String(label || "").trim()).filter(Boolean))];
}

function buildFields(payload) {
  const projectKey = String(payload.projectKey || "").trim();
  const issueType = String(payload.issueType || "Bug").trim();
  const summary = String(payload.summary || "").trim();
  const description = String(payload.description || "").trim();
  const environment = String(payload.environment || "").trim();
  const affectedMarkets = Array.isArray(payload.affectedMarkets)
    ? payload.affectedMarkets.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (!projectKey) {
    throw new Error("projectKey is required.");
  }
  if (!summary) {
    throw new Error("summary is required.");
  }
  if (!description) {
    throw new Error("description is required.");
  }

  const fields = {
    project: { key: projectKey },
    issuetype: { name: issueType || "Bug" },
    summary,
    description,
    labels: normalizeLabels(payload.labels),
  };

  if (environment) {
    fields.environment = environment;
  }

  if (JIRA_AFFECTED_MARKETS_FIELD && affectedMarkets.length) {
    fields[JIRA_AFFECTED_MARKETS_FIELD] = JIRA_AFFECTED_MARKETS_MODE === "array"
      ? affectedMarkets
      : affectedMarkets.join(", ");
  }

  const assigneeId = String(payload.assigneeId || "").trim();
  if (assigneeId) {
    fields.assignee = JIRA_ASSIGNEE_FIELD_MODE === "accountid"
      ? { accountId: assigneeId }
      : { name: assigneeId };
  }

  const sprintFieldId = String(payload.sprintFieldId || "").trim();
  const sprintId = payload.sprintId !== undefined && payload.sprintId !== null && String(payload.sprintId).trim() !== ""
    ? Number(payload.sprintId)
    : null;
  if (sprintFieldId && Number.isFinite(sprintId)) {
    fields[sprintFieldId] = sprintId;
  }

  return fields;
}

async function createJiraIssue(payload) {
  if (!JIRA_BASE_URL) {
    throw new Error("JIRA_BASE_URL is not set.");
  }

  const endpoint = `${JIRA_BASE_URL}/rest/api/2/issue`;
  const headers = {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
  };
  const fields = buildFields(payload);

  async function postIssue(issueFields) {
    return axios.post(
      endpoint,
      { fields: issueFields },
      {
        headers,
        timeout: 30000,
      },
    );
  }

  let response;
  try {
    response = await postIssue(fields);
  } catch (error) {
    const rejectedFields = error?.response?.data?.errors;
    if (!rejectedFields || typeof rejectedFields !== "object") {
      throw error;
    }

    // Jira projects can hide fields from Create screens. Retry once after
    // stripping only the fields Jira explicitly rejected.
    const retryFields = { ...fields };
    let removedAny = false;
    for (const fieldName of Object.keys(rejectedFields)) {
      if (Object.prototype.hasOwnProperty.call(retryFields, fieldName)) {
        delete retryFields[fieldName];
        removedAny = true;
      }
    }

    if (!removedAny) {
      throw error;
    }

    response = await postIssue(retryFields);
  }

  const key = response?.data?.key || "";
  return {
    id: response?.data?.id,
    key,
    self: response?.data?.self,
    browseUrl: key ? `${JIRA_BASE_URL}/browse/${key}` : "",
  };
}

async function fetchAssignableUsers(projectKey, query) {
  if (!JIRA_BASE_URL) {
    throw new Error("JIRA_BASE_URL is not set.");
  }
  if (!projectKey) {
    throw new Error("project is required.");
  }

  const params = { project: projectKey, maxResults: 50 };
  if (query) {
    // This Jira instance's assignable/search ignores `query` and filters on `username` instead.
    params.username = query;
  }

  const response = await axios.get(`${JIRA_BASE_URL}/rest/api/2/user/assignable/search`, {
    headers: getAuthHeaders(),
    params,
    timeout: 15000,
  });

  const users = Array.isArray(response?.data) ? response.data : [];
  return users.map((user) => ({
    id: user.accountId || user.name || user.key || "",
    label: user.displayName || user.name || user.accountId || "Unknown",
    detail: user.emailAddress || "",
  })).filter((user) => user.id);
}

async function fetchBoards(projectKey) {
  if (!JIRA_BASE_URL) {
    throw new Error("JIRA_BASE_URL is not set.");
  }
  if (!projectKey) {
    throw new Error("project is required.");
  }

  const response = await axios.get(`${JIRA_BASE_URL}/rest/agile/1.0/board`, {
    headers: getAuthHeaders(),
    params: { projectKeyOrId: projectKey },
    timeout: 15000,
  });

  const boards = Array.isArray(response?.data?.values) ? response.data.values : [];
  return boards.map((board) => ({ id: board.id, name: board.name, type: board.type }));
}

async function fetchSprints(boardId) {
  if (!JIRA_BASE_URL) {
    throw new Error("JIRA_BASE_URL is not set.");
  }
  if (!boardId) {
    throw new Error("boardId is required.");
  }

  const response = await axios.get(`${JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint`, {
    headers: getAuthHeaders(),
    params: { state: "active,future" },
    timeout: 15000,
  });

  const sprints = Array.isArray(response?.data?.values) ? response.data.values : [];
  return sprints.map((sprint) => ({ id: sprint.id, name: sprint.name, state: sprint.state }));
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      jiraBaseUrlConfigured: Boolean(JIRA_BASE_URL),
      jiraTokenConfigured: Boolean(JIRA_API_TOKEN),
      authType: JIRA_AUTH_TYPE,
      affectedMarketsFieldConfigured: Boolean(JIRA_AFFECTED_MARKETS_FIELD),
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/jira/assignable-users") {
    try {
      const users = await fetchAssignableUsers(
        requestUrl.searchParams.get("project"),
        requestUrl.searchParams.get("query"),
      );
      sendJson(res, 200, { users });
    } catch (error) {
      const responseMessage = error?.response?.data || error?.message || "Unknown Jira bridge error";
      sendJson(res, 500, { error: typeof responseMessage === "string" ? responseMessage : JSON.stringify(responseMessage) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/jira/boards") {
    try {
      const boards = await fetchBoards(requestUrl.searchParams.get("project"));
      sendJson(res, 200, { boards });
    } catch (error) {
      const responseMessage = error?.response?.data || error?.message || "Unknown Jira bridge error";
      sendJson(res, 500, { error: typeof responseMessage === "string" ? responseMessage : JSON.stringify(responseMessage) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/jira/sprints") {
    try {
      const sprints = await fetchSprints(requestUrl.searchParams.get("boardId"));
      sendJson(res, 200, { sprints });
    } catch (error) {
      const responseMessage = error?.response?.data || error?.message || "Unknown Jira bridge error";
      sendJson(res, 500, { error: typeof responseMessage === "string" ? responseMessage : JSON.stringify(responseMessage) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/jira/issues") {
    try {
      const payload = await parseRequestBody(req);
      const result = await createJiraIssue(payload);
      sendJson(res, 201, result);
    } catch (error) {
      const responseMessage = error?.response?.data || error?.message || "Unknown Jira bridge error";
      const detail = typeof responseMessage === "string"
        ? responseMessage
        : JSON.stringify(responseMessage);
      sendJson(res, 500, { error: detail });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`[jira-bridge] Listening on http://localhost:${PORT}`);
  console.log(`[jira-bridge] Jira base URL configured: ${Boolean(JIRA_BASE_URL)}`);
  console.log(`[jira-bridge] Jira token configured: ${Boolean(JIRA_API_TOKEN)}`);
  console.log(`[jira-bridge] Auth type: ${JIRA_AUTH_TYPE}`);
});