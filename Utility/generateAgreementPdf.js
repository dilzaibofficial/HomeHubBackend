const PDFDocument = require("pdfkit");

const BLUE = "#2563EB";
const DARK = "#0F172A";
const GRAY = "#64748B";
const LIGHT = "#E2E8F0";

// Renders a branded rental agreement as a PDF Buffer - no external fonts
// or browser needed, just pdfkit's built-in Helvetica family.
function buildAgreementPdf({ property, owner, tenant, agreement, effectiveRent }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;

    // ── Header banner ──
    doc.rect(0, 0, pageWidth, 92).fill(BLUE);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(24).text("HomeHub", 50, 28);
    doc.font("Helvetica").fontSize(11).text("Rental Agreement", 50, 58);
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(`Agreement ID: ${agreement._id}`, pageWidth - 260, 30, { width: 210, align: "right" })
      .text(`Date: ${new Date().toLocaleDateString("en-GB")}`, pageWidth - 260, 44, { width: 210, align: "right" });

    let y = 125;

    const sectionHeader = (title) => {
      doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(13).text(title, 50, y);
      y += 19;
      doc.moveTo(50, y).lineTo(pageWidth - 50, y).strokeColor(LIGHT).lineWidth(1).stroke();
      y += 12;
    };

    const row = (label, value) => {
      doc.fillColor(GRAY).font("Helvetica").fontSize(10).text(label, 50, y, { width: 160 });
      doc.fillColor(DARK).font("Helvetica-Bold").fontSize(10).text(String(value ?? "-"), 220, y, { width: pageWidth - 270 });
      y += 20;
    };

    sectionHeader("Property Details");
    row("Title", property.title);
    row("Address", property.address);
    row("Type", property.type);
    row("Bedrooms", property.bedroom);
    row("Bathrooms", property.bathroom);
    row("Area (sq ft)", property.areaofhouse);
    y += 8;

    sectionHeader("Landlord (Owner)");
    row("Name", owner.username);
    row("Email", owner.email);
    row("Phone", owner.phonenumber);
    y += 8;

    sectionHeader("Tenant");
    row("Name", tenant.username);
    row("Email", tenant.email);
    row("Phone", tenant.phonenumber);
    y += 8;

    sectionHeader("Financial Terms");
    row("Advance (released from escrow)", `Rs ${agreement.agreementPricePaid}`);
    row("Monthly Rent", `Rs ${effectiveRent}`);
    row("Agreement Finalized On", new Date().toLocaleDateString("en-GB"));
    y += 15;

    sectionHeader("Terms & Conditions");
    doc
      .fillColor(DARK)
      .font("Helvetica")
      .fontSize(9)
      .text(
        "1. The Tenant agrees to pay the Monthly Rent through the HomeHub platform, on or before the due date each month.\n\n" +
          "2. The Advance was held in escrow by HomeHub and has been released to the Landlord now that both parties have accepted this agreement.\n\n" +
          "3. Either party may raise a dispute through HomeHub support at any time before a future month's payment is finalized.\n\n" +
          "4. This agreement remains active until either party formally ends the tenancy through the HomeHub platform.\n\n" +
          "5. Both parties confirm that the details above accurately reflect what was agreed within the HomeHub app.",
        50,
        y,
        { width: pageWidth - 100, lineGap: 4 },
      );
    y = doc.y + 45;

    // ── Signature lines + footer ──
    // Both flow naturally from `y` rather than pinning to the page's
    // bottom edge - anchoring to doc.page.height there fought pdfkit's
    // own auto-pagination (it still respects the bottom margin for
    // flowing text even with an explicit y), scattering the signature
    // block and footer across their own near-empty extra pages.
    if (y > doc.page.height - 110) {
      doc.addPage();
      y = 60;
    }
    doc.strokeColor(GRAY).lineWidth(1);
    doc.moveTo(50, y).lineTo(230, y).stroke();
    doc.moveTo(pageWidth - 230, y).lineTo(pageWidth - 50, y).stroke();
    y += 8;
    doc.fillColor(GRAY).font("Helvetica").fontSize(9);
    doc.text("Landlord", 50, y);
    doc.text("Tenant", pageWidth - 230, y);

    y += 40;
    doc
      .fontSize(8)
      .fillColor(GRAY)
      .text(
        "Generated automatically by HomeHub upon mutual agreement finalization. This document is provided for the parties' records.",
        50,
        y,
        { width: pageWidth - 100, align: "center" },
      );

    doc.end();
  });
}

module.exports = { buildAgreementPdf };
