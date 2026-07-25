import sharp from "sharp";

const SOURCE = "assets/img/DSC05857.jpg";
const SIZES = [
  { name: "public/icons/icon-192.png", size: 192 },
  { name: "public/icons/icon-512.png", size: 512 },
  { name: "public/icons/apple-touch-icon-180.png", size: 180 },
];

for (const { name, size } of SIZES) {
  await sharp(SOURCE)
    .resize(size, size, { fit: "cover", position: "top" })
    .png()
    .toFile(name);
  console.log(`Wrote ${name}`);
}
