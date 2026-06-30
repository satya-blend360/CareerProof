#input_type_name: ParseJobRequirementsInput
#output_type_name: ParseJobRequirementsResult
#function_name: parse_job_requirements

import re
from typing import List, Optional

from pydantic import BaseModel
from lemma_sdk import FunctionContext, Pod


class ParseJobRequirementsInput(BaseModel):
    application_id: str
    company: Optional[str] = None
    role_title: Optional[str] = None
    job_url: Optional[str] = None
    job_description: str
    resume_context: Optional[str] = None


class ParsedRequirement(BaseModel):
    requirement_text: str
    requirement_type: str
    importance: str
    required_or_preferred: str
    skill: Optional[str] = None
    seniority_signal: Optional[str] = None
    parsed_reason: str


class ParseJobRequirementsResult(BaseModel):
    application_id: str
    created_requirements: int
    total_requirements: int
    requirements: List[ParsedRequirement]
    summary: str


REQUIREMENT_CATALOG = [
    {
        "pattern": r"\bpython\b|\bfastapi\b|\bdjango\b|\bflask\b",
        "requirement_text": "Develop Python APIs",
        "requirement_type": "skill",
        "importance": "high",
        "skill": "Python",
        "parsed_reason": "The job description mentions Python or a Python web framework.",
    },
    {
        "pattern": r"\bpostgres(?:ql)?\b|\bpostgres\b",
        "requirement_text": "Work with PostgreSQL",
        "requirement_type": "skill",
        "importance": "high",
        "skill": "PostgreSQL",
        "parsed_reason": "The job description mentions PostgreSQL.",
    },
    {
        "pattern": r"\brest\b|\bapi\b|\bapis\b|\bendpoint\b|\bendpoints\b",
        "requirement_text": "Build REST endpoints",
        "requirement_type": "skill",
        "importance": "high",
        "skill": "REST API design",
        "parsed_reason": "The job description mentions APIs, REST, or endpoints.",
    },
    {
        "pattern": r"\bgit\b|\bgithub\b|\bversion control\b",
        "requirement_text": "Use Git for version control",
        "requirement_type": "skill",
        "importance": "medium",
        "skill": "Git",
        "parsed_reason": "The job description mentions Git, GitHub, or version control.",
    },
    {
        "pattern": r"\bdebug\w*\b|\btroubleshoot\w*\b",
        "requirement_text": "Debug software issues",
        "requirement_type": "skill",
        "importance": "medium",
        "skill": "debugging",
        "parsed_reason": "The job description mentions debugging or troubleshooting.",
    },
    {
        "pattern": r"\bcloud\b|\bdeploy\w*\b|\bhosting\b|\baws\b|\bazure\b|\bgcp\b",
        "requirement_text": "Deploy to the cloud",
        "requirement_type": "experience",
        "importance": "high",
        "skill": "cloud deployment",
        "parsed_reason": "The job description mentions cloud, deployment, hosting, or a cloud provider.",
    },
    {
        "pattern": r"built[^.]{0,80}\bapi\b|\bapi project\b|\bproject\b",
        "requirement_text": "Have built at least one API project",
        "requirement_type": "experience",
        "importance": "high",
        "skill": "prior API project",
        "parsed_reason": "The job description asks for project experience or API-building experience.",
    },
    {
        "pattern": r"\bsql\b|\bqueries\b|\bquery\b|\bdatabase\b|\bdatabases\b",
        "requirement_text": "Write SQL queries",
        "requirement_type": "skill",
        "importance": "medium",
        "skill": "SQL",
        "parsed_reason": "The job description mentions SQL, queries, or databases.",
    },
    {
        "pattern": r"\btest\w*\b|\bpytest\b|\bunit test\w*\b|\bintegration test\w*\b",
        "requirement_text": "Write tests",
        "requirement_type": "skill",
        "importance": "medium",
        "skill": "software testing",
        "parsed_reason": "The job description mentions tests or testing.",
    },
    {
        "pattern": r"\bdocument\w*\b|\breadme\b|\bdocs\b|\btechnical writing\b",
        "requirement_text": "Document their work",
        "requirement_type": "responsibility",
        "importance": "medium",
        "skill": "technical documentation",
        "parsed_reason": "The job description mentions documentation, docs, or README work.",
    },
]


def seniority_signal(text: str) -> str:
    lowered = text.lower()
    if "intern" in lowered or "internship" in lowered:
        return "intern"
    if "senior" in lowered or "lead" in lowered or "staff" in lowered:
        return "senior"
    if "junior" in lowered or "entry" in lowered or "graduate" in lowered:
        return "early career"
    return "unknown"


def fallback_requirements(job_description: str, signal: str) -> List[ParsedRequirement]:
    sentences = [part.strip(" -\n\t") for part in re.split(r"(?<=[.!?])\s+|\n+", job_description) if part.strip()]
    requirements: List[ParsedRequirement] = []
    for sentence in sentences[:8]:
        if len(sentence) < 20:
            continue
        requirements.append(
            ParsedRequirement(
                requirement_text=sentence[:240],
                requirement_type="other",
                importance="medium",
                required_or_preferred="unknown",
                skill=None,
                seniority_signal=signal,
                parsed_reason="Fallback extraction from a requirement-like sentence in the job description.",
            )
        )
    return requirements


def parse_requirements(job_description: str) -> List[ParsedRequirement]:
    lowered = job_description.lower()
    signal = seniority_signal(lowered)
    parsed: List[ParsedRequirement] = []
    seen = set()

    for item in REQUIREMENT_CATALOG:
        if not re.search(item["pattern"], lowered, flags=re.IGNORECASE):
            continue
        key = item["requirement_text"].lower()
        if key in seen:
            continue
        seen.add(key)
        parsed.append(
            ParsedRequirement(
                requirement_text=item["requirement_text"],
                requirement_type=item["requirement_type"],
                importance=item["importance"],
                required_or_preferred="required",
                skill=item["skill"],
                seniority_signal=signal,
                parsed_reason=item["parsed_reason"],
            )
        )

    return parsed or fallback_requirements(job_description, signal)


def list_requirements(pod: Pod, application_id: str) -> List[dict]:
    return pod.records.list(
        "job_requirements",
        limit=100,
        filter=[{"field": "application_id", "op": "eq", "value": application_id}],
    ).to_dict()["items"]


async def parse_job_requirements(ctx: FunctionContext, data: ParseJobRequirementsInput) -> ParseJobRequirementsResult:
    pod = Pod.from_env()
    application = pod.table("applications").get(data.application_id)
    job_description = data.job_description.strip()
    if not job_description:
        raise ValueError("job_description is required")

    update_data = {
        "company": data.company.strip() if data.company else application.get("company") or "Unknown company",
        "role_title": data.role_title.strip() if data.role_title else application.get("role_title") or "Untitled role",
        "job_url": data.job_url.strip() if data.job_url else application.get("job_url"),
        "job_description": job_description,
        "status": "analyzing",
        "next_action": "Review parsed requirements",
    }
    pod.table("applications").update(data.application_id, {k: v for k, v in update_data.items() if v is not None})

    parsed = parse_requirements(job_description)
    existing = list_requirements(pod, data.application_id)
    existing_keys = {str(row.get("requirement_text", "")).strip().lower() for row in existing}
    rows_to_create = []

    for requirement in parsed:
        key = requirement.requirement_text.strip().lower()
        if key in existing_keys:
            continue
        rows_to_create.append(
            {
                "application_id": data.application_id,
                "requirement_text": requirement.requirement_text,
                "requirement_type": requirement.requirement_type,
                "importance": requirement.importance,
                "required_or_preferred": requirement.required_or_preferred,
                "skill": requirement.skill,
                "seniority_signal": requirement.seniority_signal,
                "parsed_reason": requirement.parsed_reason,
            }
        )

    created_count = 0
    if rows_to_create:
        created_count = pod.records.bulk_create("job_requirements", rows_to_create)

    final_requirements = list_requirements(pod, data.application_id)
    return ParseJobRequirementsResult(
        application_id=data.application_id,
        created_requirements=int(created_count),
        total_requirements=len(final_requirements),
        requirements=parsed,
        summary=f"Parsed {len(parsed)} requirements; created {int(created_count)} new rows; total requirement rows now {len(final_requirements)}.",
    )