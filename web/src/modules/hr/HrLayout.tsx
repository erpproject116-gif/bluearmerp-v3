import type { ParentComponent } from "solid-js";
import "./hr-surface.css";

export const HrLayout: ParentComponent = (props) => <div class="hr-surface min-w-0">{props.children}</div>;
