import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Generates a real 3-page engraved-style piano PDF score ("Prelude in C Major,
 * BWV 846 - J.S. Bach.pdf") so the user can test multipage reading, autoscroll,
 * bookmarks, and annotations with one click even before importing external PDFs.
 */
export async function generateSamplePianoPdf(): Promise<File> {
  const pdf = await PDFDocument.create();
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);

  const pageWidth = 595.28; // A4 width pt
  const pageHeight = 841.89; // A4 height pt
  const margin = 48;
  const ink = rgb(0.1, 0.09, 0.08);
  const faint = rgb(0.35, 0.33, 0.31);

  for (let p = 0; p < 3; p++) {
    const page = pdf.addPage([pageWidth, pageHeight]);

    if (p === 0) {
      const title = 'Prelude in C Major';
      const tw = serifBold.widthOfTextAtSize(title, 22);
      page.drawText(title, { x: (pageWidth - tw) / 2, y: pageHeight - 62, size: 22, font: serifBold, color: ink });

      const sub = 'from The Well-Tempered Clavier, Book I - BWV 846';
      const sw = serifItalic.widthOfTextAtSize(sub, 11);
      page.drawText(sub, { x: (pageWidth - sw) / 2, y: pageHeight - 80, size: 11, font: serifItalic, color: faint });

      const comp = 'Johann Sebastian Bach (1685-1750)';
      const cw = serif.widthOfTextAtSize(comp, 11);
      page.drawText(comp, { x: pageWidth - margin - cw, y: pageHeight - 102, size: 11, font: serif, color: ink });

      page.drawText('Allegro moderato (80 BPM)', {
        x: margin,
        y: pageHeight - 102,
        size: 11,
        font: serifBold,
        color: ink,
      });
    } else {
      page.drawText(`Prelude in C Major (BWV 846) - Page ${p + 1}`, {
        x: margin,
        y: pageHeight - 42,
        size: 10,
        font: serifItalic,
        color: faint,
      });
    }

    const systemsPerPage = p === 0 ? 5 : 6;
    const topStart = p === 0 ? pageHeight - 140 : pageHeight - 75;
    const systemSpacing = 122;

    for (let s = 0; s < systemsPerPage; s++) {
      const trebleTop = topStart - s * systemSpacing;
      const lineGap = 6;
      const trebleBottom = trebleTop - 4 * lineGap;
      const bassTop = trebleBottom - 26;
      const bassBottom = bassTop - 4 * lineGap;

      // Measure number
      const barNum = p * 12 + s * 2 + 1;
      page.drawText(String(barNum), {
        x: margin,
        y: trebleTop + 6,
        size: 8.5,
        font: serifItalic,
        color: faint,
      });

      // Draw 5 treble + 5 bass staff lines
      for (let l = 0; l < 5; l++) {
        const yT = trebleTop - l * lineGap;
        const yB = bassTop - l * lineGap;
        page.drawLine({ start: { x: margin, y: yT }, end: { x: pageWidth - margin, y: yT }, thickness: 0.65, color: ink });
        page.drawLine({ start: { x: margin, y: yB }, end: { x: pageWidth - margin, y: yB }, thickness: 0.65, color: ink });
      }

      // Grand staff brace & barlines (left, middle, right)
      const barsX = [margin, margin + (pageWidth - margin * 2) * 0.52, pageWidth - margin];
      for (const bx of barsX) {
        page.drawLine({
          start: { x: bx, y: trebleTop },
          end: { x: bx, y: bassBottom },
          thickness: bx === margin ? 1.4 : 0.8,
          color: ink,
        });
      }

      // Time signature on first system
      if (p === 0 && s === 0) {
        page.drawText('4', { x: margin + 22, y: trebleTop - 11, size: 13, font: serifBold, color: ink });
        page.drawText('4', { x: margin + 22, y: trebleTop - 23, size: 13, font: serifBold, color: ink });
        page.drawText('4', { x: margin + 22, y: bassTop - 11, size: 13, font: serifBold, color: ink });
        page.drawText('4', { x: margin + 22, y: bassTop - 23, size: 13, font: serifBold, color: ink });
      }

      // Draw arpeggiated sixteenth-note patterns across both bars in the system
      const startX = p === 0 && s === 0 ? margin + 44 : margin + 18;
      const usableW = pageWidth - margin - startX - 10;
      const notesCount = 16;
      const patternOffsets = [0, 3, 6, 9, 12, 6, 9, 12, 0, 3, 6, 9, 12, 6, 9, 12];

      for (let n = 0; n < notesCount; n++) {
        const nx = startX + (n + 0.4) * (usableW / notesCount);
        const step = patternOffsets[n] + ((s + p) % 3) * 1.5;
        const isBass = n % 8 < 2;
        const ny = isBass ? bassBottom + step * 1.8 : trebleBottom + (step - 5) * 1.8;

        // Notehead
        page.drawEllipse({
          x: nx,
          y: ny,
          xScale: 3.4,
          yScale: 2.4,
          color: ink,
        });

        // Stem
        const stemTop = ny + 18;
        page.drawLine({
          start: { x: nx + 3, y: ny },
          end: { x: nx + 3, y: stemTop },
          thickness: 0.75,
          color: ink,
        });

        // Beams every group of 4
        if (n % 4 < 3) {
          const nextNx = startX + (n + 1.4) * (usableW / notesCount);
          const nextStep = patternOffsets[n + 1] + ((s + p) % 3) * 1.5;
          const nextIsBass = (n + 1) % 8 < 2;
          const nextNy = nextIsBass ? bassBottom + nextStep * 1.8 : trebleBottom + (nextStep - 5) * 1.8;
          page.drawLine({
            start: { x: nx + 3, y: stemTop },
            end: { x: nextNx + 3, y: nextNy + 18 },
            thickness: 2,
            color: ink,
          });
        }
      }
    }

    const footer = `- ${p + 1} -`;
    const fw = serif.widthOfTextAtSize(footer, 10);
    page.drawText(footer, { x: (pageWidth - fw) / 2, y: 24, size: 10, font: serif, color: faint });
  }

  const bytes = await pdf.save();
  return new File([bytes as BlobPart], 'Prelude in C Major BWV 846 - J.S. Bach.pdf', {
    type: 'application/pdf',
  });
}
