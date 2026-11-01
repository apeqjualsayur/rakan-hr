import { createCn } from "cn/config";

// Class merging that knows Rakan's custom tokens from globals.css, so that
// e.g. cn("rounded-control", "rounded-card") keeps only the last radius and
// cn("text-label", "text-ink") keeps both (size + colour).
export const cn = createCn({
  extend: {
    theme: {
      radius: ["control", "tile", "card", "hero"],
      text: [
        "display",
        "display-sm",
        "h2",
        "h3",
        "body",
        "meta",
        "label",
        "stat",
      ],
    },
  },
});
