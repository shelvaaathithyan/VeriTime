import { VerificationStatus } from '../types';
import { getVerificationLabel, getVerificationBadgeClass } from '../utils/formatters';

interface Props {
  status: VerificationStatus;
}

export default function VerificationBadge({ status }: Props) {
  return (
    <span className={getVerificationBadgeClass(status)}>
      {getVerificationLabel(status)}
    </span>
  );
}
