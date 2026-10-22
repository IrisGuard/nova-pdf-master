import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync, writeFileSync } from 'node:fs';

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(readFileSync('public/fonts/NotoSans-Regular.ttf'), { subset: false });
const bold = await doc.embedFont(readFileSync('public/fonts/NotoSans-Bold.ttf'), { subset: false });
const page = doc.addPage([595.28, 841.89]);
page.drawText('Hello world — Αυτό δοκιμάζει τοπική γραφή', { x: 50, y: 700, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
page.drawText('Bold heading', { x: 50, y: 660, size: 22, font: bold });
console.log('width', font.widthOfTextAtSize('Hello', 12));
const bytes = await doc.save();
writeFileSync('tests/artifacts/noto-test.pdf', bytes);
console.log('saved', bytes.length);

