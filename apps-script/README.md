# Brand forms: Google Sheet and email setup

The forms at `/brand/forms/` send each submission to a small Google Apps Script. The script adds a row to a Google Sheet (one tab per form), saves any uploaded files to Google Drive, emails the brand team and sends a confirmation to the person who submitted.

## Current setup

- **Google account:** brandmyeloma@gmail.com
- **Sheet:** "Brand Engagement Hub - Form submissions"
- **Apps Script project:** "Brand Engagement Hub - Forms" (standalone, linked by `SHEET_ID`)
- **Web app URL:** set in `brand/forms/assets/forms.js`

The steps below are for setting it up from scratch.

This takes about 10 minutes and only needs doing once. Use the Google account that should own the Sheet and send the emails (ideally a shared brand@ account rather than a personal one).

## 1. Create the Sheet and add the script

1. Create a new Google Sheet, e.g. "Brand Engagement Hub - Form submissions".
2. Go to **Extensions > Apps Script**.
3. Delete the placeholder code, then paste in everything from `Code.gs`.
4. Check the settings at the top (`NOTIFY_EMAIL` is brand@myeloma.org.au by default).
5. Click **Save**.

## 2. Grant permissions

1. In the function menu at the top, choose `testSetup` and click **Run**.
2. Approve the permissions prompt (Sheets, Drive and sending email). If you see "Google hasn't verified this app", click **Advanced > Go to project**. This is normal for your own scripts.
3. A "Test form" tab should appear in the Sheet, and a test email should arrive at brand@. You can delete that tab afterwards.

## 3. Deploy as a web app

1. Click **Deploy > New deployment**, then the cog next to "Select type" and choose **Web app**.
2. Set **Execute as:** Me, and **Who has access:** Anyone.
3. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

## 4. Connect the forms

Open `brand/forms/assets/forms.js` and replace `PASTE_APPS_SCRIPT_WEB_APP_URL_HERE` with that URL. Commit, and the forms are live.

## Making changes later

- **Editing the script:** after saving, go to **Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy**. The URL stays the same.
- **Adding a question to a form:** just add it to the form's HTML. A new column is added to the Sheet automatically.
- **Tracking progress:** each tab has a "Status" column (set to "New"). Update it as briefs move along.

## Limits

- Files: up to 10 MB each and 20 MB in total per submission. Larger files should be shared as a link in the form.
- Emails: free Google accounts can send about 100 emails a day and Google Workspace accounts about 1,500. Each submission sends 2.
