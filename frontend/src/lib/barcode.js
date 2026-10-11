// Random shop barcodes: "20" + 10 random digits + EAN-13 check digit. Codes
// starting with 2 are the in-store range, so they never clash with the
// barcode printed on a packet. The server makes the same kind when the field
// is left empty, and rejects a code that is already taken.
export function ean13CheckDigit(twelve) {
  const sum = twelve.split('').reduce((a, n, i) => a + Number(n) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

export function randomBarcode() {
  let body = '20';
  for (let i = 0; i < 10; i++) body += Math.floor(Math.random() * 10);
  return body + ean13CheckDigit(body);
}
