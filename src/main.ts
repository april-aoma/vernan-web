import { mount } from "./mount";

const root = document.querySelector("#vernan-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("#vernan-root missing");
}

mount(root, {
  // Resolve against the page URL so GitHub Pages / subpath hosts work with Vite `base: "./"`.
  assetBase: new URL("assets/", window.location.href).href,
});
