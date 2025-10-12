import { detectPii, DetectionResult } from "@/shared/pii-detector";
import ReactDOM from "react-dom/client";
import type { Root } from "react-dom/client";

// Simple warning badge component without MUI dependencies
function SimpleWarningBadge({ detections }: { detections: DetectionResult[] }) {
  const tooltipText = `PII Detected: ${detections.map((d) => d.type).join(", ")}`;
  
  return (
    <div
      title={tooltipText}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "28px",
        height: "28px",
        backgroundColor: "#fff3cd",
        border: "2px solid #ffc107",
        borderRadius: "50%",
        cursor: "pointer",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
          fill="#ff9800"
        />
      </svg>
    </div>
  );
}

export default defineContentScript({
  matches: ["<all_urls>"],

  main(ctx) {
    let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;
    let badgeContainer: HTMLDivElement | null = null;
    let badgeRoot: Root | null = null;

    const isValidInput = (
      element: Element,
    ): element is HTMLInputElement | HTMLTextAreaElement => {
      if (element.tagName === "TEXTAREA") return true;
      if (element.tagName === "INPUT") {
        const input = element as HTMLInputElement;
        const textTypes = [
          "text",
          "email",
          "tel",
          "url",
          "search",
          "password",
          "number",
        ];
        return textTypes.includes(input.type.toLowerCase());
      }
      if (element.getAttribute("contenteditable") === "true") {
        return true;
      }
      return false;
    };

    const createBadgeContainer = (
      input: HTMLInputElement | HTMLTextAreaElement,
    ): HTMLDivElement => {
      const container = document.createElement("div");
      container.id = `pii-badge-${Math.random().toString(36).substr(2, 9)}`;

      container.style.cssText = `
        position: absolute !important;
        top: 8px !important;
        right: 8px !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: auto !important;
        height: auto !important;
        transform: translateZ(0) !important;
        will-change: transform !important;
        isolation: isolate !important;
      `;

      // Find wrapper with input-wrapper class or create positioning context
      let targetParent = input.parentElement;

      // Look for the input-wrapper or text-input-wrapper
      let current = input.parentElement;
      while (current && current !== document.body) {
        const classList = current.classList;
        if (
          classList.contains("input-wrapper") ||
          classList.contains("text-input-wrapper") ||
          classList.contains("application-container")
        ) {
          targetParent = current;
          break;
        }

        const style = window.getComputedStyle(current);
        if (style.position === "relative" || style.position === "absolute") {
          targetParent = current;
          break;
        }
        current = current.parentElement;
      }

      // Make sure target parent has position relative
      if (targetParent) {
        const parentStyle = window.getComputedStyle(targetParent);
        if (parentStyle.position === "static") {
          (targetParent as HTMLElement).style.position = "relative";
        }

        targetParent.appendChild(container);
        console.log(
          "Badge container created and appended to:",
          targetParent,
          "with classes:",
          targetParent.className,
        );
      } else {
        // Fallback: append to body with fixed positioning
        container.style.position = "fixed !important";
        const rect = input.getBoundingClientRect();
        container.style.top = `${rect.top + 8}px !important`;
        container.style.left = `${rect.right - 40}px !important`;
        document.body.appendChild(container);
        console.log("Badge container appended to body (fallback)");
      }

      return container;
    };

    const handleDetection = (detections: DetectionResult[]) => {
      if (detections.length > 0 && activeInput) {
        if (!badgeContainer) {
          badgeContainer = createBadgeContainer(activeInput);

          // Force a reflow before rendering React
          badgeContainer.offsetHeight;

          badgeRoot = ReactDOM.createRoot(badgeContainer);
          badgeRoot.render(<SimpleWarningBadge detections={detections} />);

          // Double check visibility after render
          setTimeout(() => {
            if (badgeContainer) {
              console.log("Badge container after render:", {
                visible:
                  badgeContainer.offsetWidth > 0 &&
                  badgeContainer.offsetHeight > 0,
                display: window.getComputedStyle(badgeContainer).display,
                opacity: window.getComputedStyle(badgeContainer).opacity,
                zIndex: window.getComputedStyle(badgeContainer).zIndex,
                rect: badgeContainer.getBoundingClientRect(),
                innerHTML: badgeContainer.innerHTML.substring(0, 200),
              });
            }
          }, 100);

          console.log("Badge rendered with detections:", detections);
        } else if (badgeRoot) {
          badgeRoot.render(<SimpleWarningBadge detections={detections} />);
        }
      } else {
        removeBadge();
      }
    };

    const removeBadge = () => {
      if (badgeRoot) {
        badgeRoot.unmount();
        badgeRoot = null;
      }
      if (badgeContainer) {
        badgeContainer.remove();
        badgeContainer = null;
      }
    };

    const getInputValue = (
      element: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
    ): string => {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        return (element as HTMLInputElement | HTMLTextAreaElement).value;
      }
      if (element.getAttribute("contenteditable") === "true") {
        return element.textContent || "";
      }
      return "";
    };

    const debouncedScan = debounce((text: string) => {
      const results = detectPii(text);
      handleDetection(results);
    }, 500);

    const attachInputListener = (
      input: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
    ) => {
      const handler = () => {
        if (activeInput === input) {
          debouncedScan(getInputValue(input));
        }
      };

      input.addEventListener("input", handler);

      if (input.getAttribute("contenteditable") === "true") {
        input.addEventListener("keyup", handler);
      }
    };

    // Handle focus events
    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target as HTMLElement;

        if (!isValidInput(target)) return;

        // Remove previous badge if exists
        removeBadge();

        activeInput = target as HTMLInputElement | HTMLTextAreaElement;

        console.log("Input focused:", activeInput);

        // Perform an immediate scan on focus
        const currentValue = getInputValue(activeInput);
        const results = detectPii(currentValue);
        handleDetection(results);

        // Attach input listener
        attachInputListener(activeInput);
      },
      true,
    );

    document.addEventListener(
      "focusout",
      (event) => {
        const relatedTarget = event.relatedTarget as Node;

        // Don't remove if focus moved to the badge
        if (badgeContainer?.contains(relatedTarget)) {
          return;
        }

        // Delay to handle rapid focus changes
        setTimeout(() => {
          const currentFocus = document.activeElement;
          if (currentFocus !== activeInput) {
            removeBadge();
            activeInput = null;
          }
        }, 100);
      },
      true,
    );

    // Cleanup on unload
    ctx.onInvalidated(() => {
      removeBadge();
    });

    function debounce(func: (...args: any[]) => void, delay: number) {
      let timeoutId: NodeJS.Timeout;
      return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
      };
    }
  },
});