import { useState } from "react";
import { DetectionResult } from "@/shared/pii-detector";
import { getApiClient, AiDetection } from "@/shared/api-client";

export function SimpleWarningBadge({
  detections,
  onAnonymize,
  onPopupStateChange,
  inputText,
}: {
  detections: DetectionResult[];
  onAnonymize: (detections: DetectionResult[]) => void;
  onPopupStateChange: (isOpen: boolean) => void;
  inputText: string;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const [aiDetections, setAiDetections] = useState<AiDetection[] | null>(null);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'regex' | 'ai'>('regex');

  const tooltipText = `PII Detected: ${detections.map((d) => d.type).join(", ")}`;

  const handleTogglePopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !showPopup;
    setShowPopup(newState);
    onPopupStateChange(newState);
    
    // Reset AI state when closing
    if (!newState) {
      setAiDetections(null);
      setAiError(null);
      setActiveTab('regex');
    }
  };

  const handleAiScan = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent form submission
    e.stopPropagation(); // Stop event bubbling

    setAiScanning(true);
    setAiError(null);
    setActiveTab('ai');

    try {
      const apiClient = getApiClient();
      if (!apiClient) {
        throw new Error('No API key configured');
      }

      const result = await apiClient.analyzeContext(
        inputText,
        window.location.hostname
      );

      setAiDetections(result.detections);
      
      if (result.detections.length === 0) {
        setAiError('No additional PII detected by AI');
      }
    } catch (error: any) {
      console.error('AI scan error:', error);
      if (error.message.includes('Premium subscription required')) {
        setAiError('⭐ Upgrade to Premium to unlock AI scanning');
      } else if (error.message.includes('Rate limit exceeded')) {
        setAiError('⏱️ Daily AI scan limit reached. Try again tomorrow.');
      } else {
        setAiError(`AI scan failed: ${error.message}`);
      }
    } finally {
      setAiScanning(false);
    }
  };

  const handleAnonymizeClick = (detection: DetectionResult | AiDetection, e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

    // Convert AI detection to DetectionResult format
    const detectionToAnonymize: DetectionResult = 'confidence' in detection 
      ? { type: detection.type, value: detection.value }
      : detection;
    
    onAnonymize([detectionToAnonymize]);
    setShowPopup(false);
    onPopupStateChange(false);
  };

  const handleAnonymizeAll = () => {
    onAnonymize(detections);
    setShowPopup(false);
    onPopupStateChange(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        title={tooltipText}
        onClick={handleTogglePopup}
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

      {showPopup && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation(); // Also prevent on mousedown
          }}
          style={{
            position: "absolute",
            top: "100%",
            right: "0",
            marginTop: "8px",
            backgroundColor: "white",
            border: "1px solid #ddd",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "16px",
            minWidth: "320px",
            maxWidth: "450px",
            zIndex: 2147483647,
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: "14px",
          }}
        >
          {/* Header */}
          <div
            style={{
              fontWeight: "600",
              marginBottom: "12px",
              fontSize: "16px",
              color: "#333",
            }}
          >
            ⚠️ PII Detected
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "12px",
              borderBottom: "1px solid #e0e0e0",
            }}
          >
            <button
              onClick={() => setActiveTab('regex')}
              style={{
                flex: 1,
                padding: "8px",
                border: "none",
                background: "none",
                borderBottom: activeTab === 'regex' ? "2px solid #ff9800" : "2px solid transparent",
                color: activeTab === 'regex' ? "#ff9800" : "#666",
                fontWeight: activeTab === 'regex' ? "600" : "400",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Pattern Match ({detections.length})
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              style={{
                flex: 1,
                padding: "8px",
                border: "none",
                background: "none",
                borderBottom: activeTab === 'ai' ? "2px solid #9c27b0" : "2px solid transparent",
                color: activeTab === 'ai' ? "#9c27b0" : "#666",
                fontWeight: activeTab === 'ai' ? "600" : "400",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              🤖 AI Scan {aiDetections ? `(${aiDetections.length})` : ''}
            </button>
          </div>

          {/* Content */}
          <div style={{ maxHeight: "400px", overflowY: "auto" }}>
            {activeTab === 'regex' ? (
              <>
                {/* Regex Detections */}
                {detections.map((d, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "10px",
                      marginBottom: "8px",
                      backgroundColor: "#f8f9fa",
                      borderRadius: "6px",
                      border: "1px solid #e9ecef",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "600",
                        color: "#ff9800",
                        marginBottom: "6px",
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {d.type.replace(/_/g, " ")}
                    </div>
                    <div
                      style={{
                        marginBottom: "8px",
                        color: "#666",
                        wordBreak: "break-all",
                        fontFamily: "monospace",
                        fontSize: "13px",
                        padding: "6px",
                        backgroundColor: "white",
                        borderRadius: "4px",
                      }}
                    >
                      {d.value}
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAnonymizeClick(d);
                      }}
                      style={{
                        backgroundColor: "#ff9800",
                        color: "white",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "500",
                        width: "100%",
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLButtonElement).style.backgroundColor = "#f57c00";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLButtonElement).style.backgroundColor = "#ff9800";
                      }}
                    >
                      Anonymize This
                    </button>
                  </div>
                ))}

                {detections.length > 1 && (
                  <button
                    onClick={handleAnonymizeAll}
                    style={{
                      backgroundColor: "#d32f2f",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "600",
                      width: "100%",
                      marginTop: "8px",
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLButtonElement).style.backgroundColor = "#c62828";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.backgroundColor = "#d32f2f";
                    }}
                  >
                    Anonymize All ({detections.length})
                  </button>
                )}
              </>
            ) : (
              <>
                {/* AI Scan Tab */}
                {!aiDetections && !aiScanning && !aiError && (
                  <div style={{ textAlign: "center", padding: "20px" }}>
                    <div style={{ fontSize: "48px", marginBottom: "12px" }}>🤖</div>
                    <p style={{ color: "#666", marginBottom: "16px" }}>
                      Use AI to detect sensitive information that patterns might miss
                    </p>
                    <button
                      onClick={handleAiScan}
                      style={{
                        backgroundColor: "#9c27b0",
                        color: "white",
                        border: "none",
                        padding: "10px 20px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "600",
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLButtonElement).style.backgroundColor = "#7b1fa2";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLButtonElement).style.backgroundColor = "#9c27b0";
                      }}
                    >
                      Run AI Scan
                    </button>
                    <p style={{ fontSize: "11px", color: "#999", marginTop: "8px" }}>
                      Premium feature
                    </p>
                  </div>
                )}

                {aiScanning && (
                  <div style={{ textAlign: "center", padding: "20px" }}>
                    <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔄</div>
                    <p style={{ color: "#666" }}>Analyzing with AI...</p>
                  </div>
                )}

                {aiError && (
                  <div
                    style={{
                      padding: "15px",
                      backgroundColor: "#ffebee",
                      color: "#c62828",
                      borderRadius: "4px",
                      textAlign: "center",
                    }}
                  >
                    {aiError}
                  </div>
                )}

                {aiDetections && aiDetections.length > 0 && (
                  <>
                    {aiDetections.map((d, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: "10px",
                          marginBottom: "8px",
                          backgroundColor: "#f3e5f5",
                          borderRadius: "6px",
                          border: "1px solid #ce93d8",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <div
                            style={{
                              fontWeight: "600",
                              color: "#9c27b0",
                              fontSize: "12px",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {d.type.replace(/_/g, " ")}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#666",
                              backgroundColor: "white",
                              padding: "2px 6px",
                              borderRadius: "3px",
                            }}
                          >
                            {d.confidence}% confident
                          </div>
                        </div>
                        <div
                          style={{
                            marginBottom: "6px",
                            color: "#666",
                            wordBreak: "break-all",
                            fontFamily: "monospace",
                            fontSize: "13px",
                            padding: "6px",
                            backgroundColor: "white",
                            borderRadius: "4px",
                          }}
                        >
                          {d.value}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#666",
                            fontStyle: "italic",
                            marginBottom: "8px",
                          }}
                        >
                          {d.reason}
                        </div>
                        <button
                          onClick={() => handleAnonymizeClick(d)}
                          style={{
                            backgroundColor: "#9c27b0",
                            color: "white",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: "500",
                            width: "100%",
                          }}
                          onMouseEnter={(e) => {
                            (e.target as HTMLButtonElement).style.backgroundColor = "#7b1fa2";
                          }}
                          onMouseLeave={(e) => {
                            (e.target as HTMLButtonElement).style.backgroundColor = "#9c27b0";
                          }}
                        >
                          Anonymize This
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}