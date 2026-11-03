"""Build MARKOS's importable Play Data safety CSV from Google's public sample."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / "apps/mobile/store/google-play"
TEMPLATE = ROOT / "var/release-prep/google-play-data-safety-template.csv"
QUESTION = "Question ID (machine readable)"
RESPONSE = "Response ID (machine readable)"
VALUE = "Response value"


def main() -> None:
    config = json.loads((FOLDER / "data-safety.json").read_text(encoding="utf-8"))
    declared = {item["id"]: item for item in config["types"]}
    with TEMPLATE.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        fieldnames = reader.fieldnames
        rows = list(reader)
    assert fieldnames is not None
    seen: set[str] = set()
    top_level = {
        "PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA": config["collectsPersonalData"],
        "PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT": config["encryptedInTransit"],
        "PSL_DATA_COLLECTION_USER_REQUEST_DELETE": config["supportsDeletionRequests"],
    }
    for row in rows:
        question, response = row[QUESTION], row[RESPONSE]
        answer: bool | None = None
        if question in top_level:
            answer = top_level[question]
        elif question.startswith("PSL_DATA_TYPES_"):
            answer = response in declared
            if answer:
                seen.add(response)
        elif question.startswith("PSL_DATA_USAGE_RESPONSES:"):
            _, data_type, usage = question.split(":")
            if data_type in declared:
                item = declared[data_type]
                if usage == "PSL_DATA_USAGE_COLLECTION_AND_SHARING":
                    answer = response == "PSL_DATA_USAGE_ONLY_COLLECTED"
                elif usage == "PSL_DATA_USAGE_EPHEMERAL":
                    answer = False
                elif usage == "DATA_USAGE_USER_CONTROL":
                    answer = response == (
                        "PSL_DATA_USAGE_USER_CONTROL_OPTIONAL"
                        if item["optional"]
                        else "PSL_DATA_USAGE_USER_CONTROL_REQUIRED"
                    )
                elif usage == "DATA_USAGE_COLLECTION_PURPOSE":
                    answer = response in item["purposes"]
                elif usage == "DATA_USAGE_SHARING_PURPOSE":
                    answer = False
                else:
                    raise ValueError(f"Unrecognized usage question: {usage}")
        else:
            raise ValueError(f"Unrecognized question: {question}")
        row[VALUE] = "" if answer is None else str(answer).upper()
        row["Human-friendly question label"] = ""
    if seen != set(declared):
        raise ValueError("Template does not cover all declared MARKOS data types")
    # Retain explicit type choices, omit unused handling questions, and avoid
    # copying the template's long human-facing question text into the payload.
    rows = [row for row in rows if row[VALUE]]
    # Google's linked public sample predates its account-deletion questions.
    # Current IDs are cross-checked against the Fastlane plugin's source and
    # validated by the official applications.dataSafety endpoint on submission.
    def add_response(question: str, response: str, value: str, label: str, requirement: str) -> None:
        rows.append(dict(zip(fieldnames, [question, response, value, requirement, label], strict=True)))

    for method in [
        "PSL_ACM_USER_ID_PASSWORD", "PSL_ACM_USER_ID_OTHER_AUTH",
        "PSL_ACM_USER_ID_PASSWORD_OTHER_AUTH", "PSL_ACM_OAUTH", "PSL_ACM_OTHER", "PSL_ACM_NONE",
    ]:
        add_response("PSL_SUPPORTED_ACCOUNT_CREATION_METHODS", method,
                     str(method in config["supportedAccountCreationMethods"]).upper(),
                     "Supported account creation methods", "MULTIPLE_CHOICE")
    add_response("PSL_ACCOUNT_DELETION_URL", "", config["accountDeletionUrl"],
                 "Account deletion request URL", "MAYBE_REQUIRED")
    for choice in ["DATA_DELETION_YES", "DATA_DELETION_NO", "DATA_DELETION_NO_AUTO_DELETED"]:
        add_response("PSL_SUPPORT_DATA_DELETION_BY_USER", choice,
                     str(choice == "DATA_DELETION_YES").upper(),
                     "Can users request data deletion?", "SINGLE_CHOICE")
    add_response("PSL_DATA_DELETION_URL", "", config["dataDeletionUrl"],
                 "Data deletion request URL", "MAYBE_REQUIRED")
    add_response("PSL_DATA_COLLECTION_COMPLIES_FAMILY_POLICY", "", "FALSE",
                 "Families badge", "OPTIONAL")
    add_response("PSL_INDEPENDENTLY_VALIDATED", "", "FALSE",
                 "Independent security assessment badge", "OPTIONAL")
    add_response("PSL_UPI_BADGE_OPT_IN", "", "FALSE", "UPI badge", "OPTIONAL")
    destination = FOLDER / "data-safety.csv"
    with destination.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"generated": str(destination.relative_to(ROOT)), "dataTypes": len(declared), "rows": len(rows)}))


if __name__ == "__main__":
    main()
