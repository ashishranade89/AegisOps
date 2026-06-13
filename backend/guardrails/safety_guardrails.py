import logging

logger = logging.getLogger(__name__)

DANGEROUS_PATTERNS = [
    "delete",
    "drop database",
    "rm -rf",
    "format",
    "destroy",
    "terminate all",
]

def check_remediation_safety(steps: list[str]) -> tuple[bool, str]:
    """
    Validates a list of remediation steps for dangerous commands.
    Returns (is_safe, error_message).
    """
    for step in steps:
        step_lower = step.lower()
        for pattern in DANGEROUS_PATTERNS:
            if pattern in step_lower:
                logger.warning("Remediation safety block: Dangerous action '%s' found in steps.", pattern)
                return False, f"Dangerous command pattern '{pattern}' detected. Blocked for safety review."
    return True, "Passed safety validation."
