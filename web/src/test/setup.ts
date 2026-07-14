import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@solidjs/testing-library";

afterEach(() => {
  cleanup();
  // Portals can leave dialog nodes if dispose races; force-clear body children outside #root.
  document.body.innerHTML = "";
});
