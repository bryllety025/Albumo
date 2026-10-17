import Image from "next/image";
import logo from "@/assets/img/logo.png";
import logoLight from "@/assets/img/logo-light.png";

// The artwork is dark navy, which vanishes on a dark theme, so both versions
// are rendered and globals.css shows whichever matches the page's tone (set
// as data-tone on <html> by the root layout).
export default function Logo({ className }: { className?: string }) {
  return (
    <>
      <Image src={logo} alt="Albumo" className={`logo-on-light ${className ?? ""}`} priority />
      <Image src={logoLight} alt="Albumo" className={`logo-on-dark ${className ?? ""}`} priority />
    </>
  );
}
