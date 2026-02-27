/**
 * PlanForge Questionnaire → Google Sheets
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Click "Deploy" → "New deployment"
 * 5. Set type to "Web app"
 * 6. Set "Execute as" to "Me"
 * 7. Set "Who has access" to "Anyone"
 * 8. Click "Deploy" and copy the URL
 * 9. Paste that URL into GOOGLE_SHEETS_URL in planforge-questionnaire.html
 *
 * The first row of your sheet should have these column headers (paste into row 1):
 * Submitted At | First Name | Last Name | Email | Phone | Business Name | Entity Type |
 * Referral | Has 401k | Plan Age | Controlled Group | Family Ownership | Family Employees |
 * Controlled Group Count | Owner Count | Owner Age | Owner Salary | Owner K1 |
 * Additional Owners | HCE Count | HCE Avg Pay | HCE Low | HCE High |
 * NHCE Count | NHCE Avg Pay | NHCE Low | NHCE High | Avg Employee Age |
 * Employee Details | Turnover | Plan Goals | Current Provider | Current Fees |
 * Target Start | Notes | Uploaded Files
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    data.submittedAt || '',
    data.firstName || '',
    data.lastName || '',
    data.email || '',
    data.phone || '',
    data.bizName || '',
    data.bizStructure || '',
    data.referralName || '',
    data.has401k || '',
    data.planAge || '',
    data.controlledGroup || '',
    data.familyOwnership || '',
    data.familyEmployees || '',
    data.controlledGroupCount || '',
    data.ownerCount || '',
    data.ownerAge || '',
    data.ownerSalary || '',
    data.ownerK1 || '',
    data.additionalOwners || '',
    data.hceCount || '',
    data.hceAvgPay || '',
    data.hceLow || '',
    data.hceHigh || '',
    data.nhceCount || '',
    data.nhceAvgPay || '',
    data.nhceLow || '',
    data.nhceHigh || '',
    data.avgEmployeeAge || '',
    data.employeeDetails || '',
    data.turnover || '',
    data.planGoals || '',
    data.currentProvider || '',
    data.currentFees || '',
    data.targetStart || '',
    data.notes || '',
    data.uploadedFiles || ''
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
