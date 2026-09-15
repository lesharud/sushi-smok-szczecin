import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import Root, { pageTitle } from "./Root";
export { pageTitle };
export function render(path = "/") {
  return renderToString(
    <StaticRouter location={path}>
      <Root />
    </StaticRouter>,
  );
}
