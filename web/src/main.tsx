import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import { applyResolvedTheme } from "./shared/theme-preference";

applyResolvedTheme();

render(() => <App />, document.getElementById("root")!);
