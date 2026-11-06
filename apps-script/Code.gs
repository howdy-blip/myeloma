/**
 * Myeloma Australia brand forms: Google Apps Script backend
 *
 * One script handles every form on myeloma.broadcollective.com.au/brand/forms/.
 * For each submission it:
 *   1. adds a row to a tab named after the form (created automatically, headers included)
 *   2. saves any uploaded files into a Drive folder and links them in the row
 *   3. emails the brand team with every answer
 *   4. emails a confirmation copy to the person who submitted (if they gave an email)
 *
 * Setup: see apps-script/README.md
 */

// ===== Settings =====
const NOTIFY_EMAIL = "brand@myeloma.org.au,howdy@broadcollective.com.au";            // who gets new submissions (comma-separate for more)
const UPLOAD_FOLDER_NAME = "Brand form uploads";        // Drive folder for attachments
const SENDER_NAME = "Myeloma Australia Brand Team";
const SHEET_ID = "1NvYrtrc8ui6S8Sk2BBssbhxU3fGfR5vLI02wm7UR-Jg"; // "Brand Engagement Hub - Form submissions" (brandmyeloma@gmail.com)
// ====================

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const formKey = String(data.form || "general").replace(/[^a-z0-9-]/gi, "");
    const title = String(data.title || formKey);
    const fields = (data.fields || []).map(f => ({ label: String(f.label).slice(0, 300), value: String(f.value || "").slice(0, 5000) }));

    const fileLinks = saveFiles_(data.files || [], title, fields);
    const ref = writeRow_(title, fields, fileLinks);
    sendEmails_(title, ref, fields, fileLinks);

    return json_({ ok: true, ref: ref });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Lets you open the web app URL in a browser to check it's live
function doGet() {
  return json_({ ok: true, message: "Myeloma brand forms endpoint is running" });
}

function writeRow_(title, fields, fileLinks) {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = title.slice(0, 90);
  let sheet = ss.getSheetByName(sheetName);
  const labels = ["Reference", "Submitted"].concat(fields.map(f => f.label)).concat(["Files"]);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(labels.concat(["Status"]));
    styleHeader_(sheet.getRange(1, 1, 1, labels.length + 1));
    sheet.setFrozenRows(1);
  }

  // Match answers to existing headers, so column order stays stable.
  // If a question is added to the form later, a new column is inserted before "Status".
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  labels.filter(l => headers.indexOf(l) === -1).forEach(l => {
    const statusCol = headers.indexOf("Status") + 1; // 1-based, 0 if missing
    const col = statusCol || sheet.getLastColumn() + 1;
    if (statusCol) sheet.insertColumnBefore(statusCol);
    styleHeader_(sheet.getRange(1, col).setValue(l));
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  });

  const ref = makeRef_(title, sheet.getLastRow());
  const row = headers.map(h => {
    if (h === "Reference") return ref;
    if (h === "Submitted") return new Date();
    if (h === "Files") return fileLinks.map(f => f.url).join("\n");
    if (h === "Status") return "New";
    const f = fields.find(x => x.label === h);
    return f ? f.value : "";
  });
  sheet.appendRow(row);
  sheet.getRange(sheet.getLastRow(), 2).setNumberFormat("dd/mm/yyyy hh:mm");
  return ref;
}

function styleHeader_(range) {
  range.setFontWeight("bold").setBackground("#45057d").setFontColor("#ffffff");
}

function saveFiles_(files, title, fields) {
  if (!files.length) return [];
  const root = getFolder_(DriveApp.getRootFolder(), UPLOAD_FOLDER_NAME);
  const formFolder = getFolder_(root, title);
  const nameField = fields.find(f => /name/i.test(f.label) && !/project|campaign/i.test(f.label));
  const stamp = Utilities.formatDate(new Date(), "Australia/Melbourne", "yyMMdd-HHmm");
  const sub = formFolder.createFolder(stamp + (nameField && nameField.value ? " - " + nameField.value : ""));
  return files.map(f => {
    const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.type, f.name);
    const file = sub.createFile(blob);
    return { name: f.name, url: file.getUrl() };
  });
}

function getFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function makeRef_(title, n) {
  const initials = title.split(/[^a-z]+/i).filter(Boolean).map(w => w[0].toUpperCase()).join("").slice(0, 3);
  return initials + "-" + Utilities.formatDate(new Date(), "Australia/Melbourne", "yyMMdd") + "-" + String(n).padStart(3, "0");
}

function sendEmails_(title, ref, fields, fileLinks) {
  const rows = fields.filter(f => f.value).map(f =>
    '<tr><td style="padding:10px 14px;border-bottom:1px solid #eee;vertical-align:top;color:#45057d;font-weight:600;width:40%">' + esc_(f.label) +
    '</td><td style="padding:10px 14px;border-bottom:1px solid #eee;white-space:pre-wrap">' + esc_(f.value) + "</td></tr>").join("");
  const filesHtml = fileLinks.length
    ? '<p style="margin:16px 0 0"><strong>Files:</strong><br>' + fileLinks.map(f => '<a href="' + f.url + '">' + esc_(f.name) + "</a>").join("<br>") + "</p>"
    : "";
  const table = '<table style="border-collapse:collapse;width:100%;font-size:14px">' + rows + "</table>" + filesHtml;
  const wrap = (intro) =>
    '<div style="font-family:Poppins,Arial,sans-serif;color:#2b2433;max-width:640px">' +
    '<div style="background:#45057d;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><strong style="font-size:18px">' + esc_(title) + "</strong><br><span style=\"opacity:.85\">Ref " + ref + "</span></div>" +
    '<div style="border:1px solid #e3d9ec;border-top:0;padding:20px 22px;border-radius:0 0 10px 10px">' + intro + table + "</div></div>";

  const email = (fields.find(f => /email/i.test(f.label)) || {}).value;
  const name = (fields.find(f => /your name/i.test(f.label)) || {}).value || "";
  const project = (fields[0] || {}).value || "";

  // Team notification
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    replyTo: email || NOTIFY_EMAIL,
    name: SENDER_NAME,
    subject: "New " + title.toLowerCase() + ": " + project + (name ? " (" + name + ")" : ""),
    htmlBody: wrap('<p style="margin:0 0 14px">A new submission has come in. It has also been added to the Google Sheet.</p>')
  });

  // Confirmation to the person who submitted
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    MailApp.sendEmail({
      to: email,
      replyTo: NOTIFY_EMAIL,
      name: SENDER_NAME,
      subject: "We've received your " + title.toLowerCase() + " (Ref " + ref + ")",
      htmlBody: wrap('<p style="margin:0 0 14px">Hi' + (name ? " " + esc_(name.split(" ")[0]) : "") +
        ',</p><p style="margin:0 0 14px">Thanks for your submission. Here is a copy of what you sent. The team will be in touch soon. If anything changes, just reply to this email.</p>')
    });
  }
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor to grant permissions and send yourself a test email
function testSetup() {
  const fake = { postData: { contents: JSON.stringify({
    form: "test", title: "Test form",
    fields: [{ label: "Project", value: "Setup test" }, { label: "What's your name?", value: "Test" }, { label: "Email", value: NOTIFY_EMAIL }],
    files: []
  }) } };
  Logger.log(doPost(fake).getContent());
}
