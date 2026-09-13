import { render } from "solid-js/web";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { applyResolvedTheme } from "./shared/theme-preference";

applyResolvedTheme();

registerSW({ immediate: true });

render(() => <App />, document.getElementById("root")!);
