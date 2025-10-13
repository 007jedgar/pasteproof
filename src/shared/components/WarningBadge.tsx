import PrivacyTipIcon from '@mui/icons-material/PrivacyTip';
import { IconButton, Tooltip } from '@mui/material';
import { PiiType } from '@/shared/pii-detector';

interface WarningBadgeProps {
  detections: { type: PiiType; value: string }[];
}

export default function WarningBadge({ detections }: WarningBadgeProps) {
  // Create a summary of what was detected for the tooltip
  const tooltipTitle = `PII Detected: ${detections
    .map(d => d.type)
    .join(', ')}`;

  return (
    <Tooltip title={tooltipTitle} arrow>
      <IconButton
        size="small"
        sx={{
          color: '#388e3c',
          padding: '2px',
        }}
      >
        <PrivacyTipIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
