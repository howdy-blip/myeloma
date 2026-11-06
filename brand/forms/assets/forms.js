/*
  Myeloma Australia brand forms
  Sends each submission to a Google Apps Script web app, which:
    - adds a row to the matching tab in the Google Sheet
    - saves any uploaded files to a Google Drive folder
    - emails brand@ and sends a confirmation to the person who submitted
  Paste the web app URL from Apps Script (Deploy > Manage deployments) below.
*/
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwqYOHe4YCcVz4E0GDpUS8-jXzZmbTlXgdk8q5OflP3bK_i8MM-v1albojw5nvd_0G3og/exec";

const MAX_FILE_MB = 10;      // per file
const MAX_TOTAL_MB = 20;     // all files together

(function () {
  const form = document.querySelector("form[data-form]");
  if (!form) return;
  const status = form.querySelector(".status");
  const submitBtn = form.querySelector("button[type=submit]");
  const btnText = submitBtn.textContent;
  let files = [];

  // Character counters
  form.querySelectorAll("[maxlength]").forEach(el => {
    const c = el.closest(".field").querySelector(".count");
    if (!c) return;
    const upd = () => c.textContent = el.value.length + "/" + el.maxLength;
    el.addEventListener("input", upd); upd();
  });

  // File upload
  const drop = form.querySelector(".drop");
  if (drop) {
    const input = drop.querySelector("input[type=file]");
    const list = drop.parentElement.querySelector(".files");
    const render = () => {
      list.innerHTML = "";
      files.forEach((f, i) => {
        const li = document.createElement("li");
        li.innerHTML = "<span></span><button type='button' aria-label='Remove file'>Remove</button>";
        li.firstChild.textContent = f.name + " (" + (f.size / 1048576).toFixed(1) + " MB)";
        li.lastChild.onclick = () => { files.splice(i, 1); render(); };
        list.appendChild(li);
      });
    };
    const add = fl => {
      for (const f of fl) {
        if (f.size > MAX_FILE_MB * 1048576) { alert(f.name + " is over " + MAX_FILE_MB + " MB. Please share a link to it instead."); continue; }
        files.push(f);
      }
      const total = files.reduce((s, f) => s + f.size, 0);
      if (total > MAX_TOTAL_MB * 1048576) { alert("Files can total up to " + MAX_TOTAL_MB + " MB. Please share larger files as a link."); files = files.slice(0, -1); }
      render();
    };
    input.addEventListener("change", () => { add(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => add(e.dataTransfer.files));
  }

  // Conditional fields: data-show-if="name=value"
  const conds = [...form.querySelectorAll("[data-show-if]")];
  const applyConds = () => conds.forEach(el => {
    const [name, val] = el.dataset.showIf.split("=");
    const checked = form.querySelector("[name='" + name + "']:checked") || form.querySelector("select[name='" + name + "']");
    const show = checked && checked.value === val;
    el.hidden = !show;
  });
  form.addEventListener("change", applyConds); applyConds();

  const labelOf = field => field.dataset.label ||
    (field.querySelector("label, .label").textContent || "").replace("*", "").trim();

  const valueOf = field => {
    const boxes = field.querySelectorAll("input[type=checkbox], input[type=radio]");
    if (boxes.length) return [...boxes].filter(b => b.checked).map(b => b.value).join(", ");
    const el = field.querySelector("input, textarea, select");
    if (!el) return "";
    if (el.type === "date" && el.value) { const [y, m, d] = el.value.split("-"); return d + "/" + m + "/" + y; }
    return el.value.trim();
  };

  const validate = () => {
    let first = null;
    form.querySelectorAll(".field").forEach(field => {
      if (field.closest("[hidden]")) { field.classList.remove("invalid"); return; }
      const required = field.hasAttribute("data-required");
      const v = valueOf(field);
      let ok = !required || v !== "";
      const email = field.querySelector("input[type=email]");
      if (ok && email && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ok = false;
      field.classList.toggle("invalid", !ok);
      if (!ok && !first) first = field;
    });
    if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); const el = first.querySelector("input, textarea, select"); el && el.focus({ preventScroll: true }); }
    return !first;
  };
  form.addEventListener("input", e => { const f = e.target.closest(".field.invalid"); f && valueOf(f) && f.classList.remove("invalid"); });

  const toBase64 = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    status.textContent = ""; status.className = "status";
    if (!validate()) { status.textContent = "Please check the highlighted fields."; status.classList.add("error"); return; }
    if (form.querySelector(".hp input").value) return; // bot trap

    const fields = [...form.querySelectorAll(".field")]
      .filter(f => !f.closest("[hidden]") && !f.querySelector("input[type=file]"))
      .map(f => ({ label: labelOf(f), value: valueOf(f) }));

    submitBtn.disabled = true;
    submitBtn.textContent = files.length ? "Uploading files…" : "Submitting…";
    try {
      const payload = {
        form: form.dataset.form,
        title: form.dataset.title,
        fields,
        files: await Promise.all(files.map(async f => ({ name: f.name, type: f.type || "application/octet-stream", data: await toBase64(f) })))
      };
      const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain;charset=utf-8" } });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "Something went wrong");
      const card = form.closest(".card");
      const email = (fields.find(f => /email/i.test(f.label)) || {}).value;
      card.querySelector(".done p").textContent = email
        ? "Thanks! A copy has been sent to " + email + ". The team will be in touch soon."
        : "Thanks! The team will be in touch soon.";
      form.hidden = true;
      card.querySelector(".done").hidden = false;
      card.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      status.textContent = "Sorry, that didn't go through. Please try again, or email brand@myeloma.org.au.";
      status.classList.add("error");
      submitBtn.disabled = false;
      submitBtn.textContent = btnText;
      console.error(err);
    }
  });
})();
