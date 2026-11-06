// Detail pages shown before a visitor leaves for a product's own site. The site link
// comes from the same run-time variables as the home cards (lib/platform.js).

const env = (name) => (process.env[name] || "").trim() || null;

const PRODUCTS = {
  training: {
    slug: "training", siteVar: "TRAINING_URL", eyebrow: "Education", name: "InnovaCare Training",
    title: "NCLEX, nursing and medical exam review",
    image: "/photos/software/training.jpg", alt: "A student carrying a textbook",
    short: "Prepare for licensure exams with question banks, practice exams, progress tracking and tutor support in one place.",
    intro: "InnovaCare Training helps nursing and medical learners get ready for exam day. Study with question banks and adaptive practice exams, see where you stand on a clear dashboard, and get help from tutors and faculty-backed content.",
    features: [
      ["clipboard", "Question banks & CAT exams", "Practice with large question banks and computer-adaptive tests that feel like the real exam."],
      ["chart", "Performance dashboards", "See your scores, strengths and weak areas, and know what to study next."],
      ["users", "Tutor & faculty support", "Review content built with educators, and get guidance when you are stuck."],
      ["target", "Personal study plans", "A plan matched to your exam date, your track and your goal."],
      ["phone", "Study anywhere", "Learn from your phone or computer, at any hour."],
      ["building", "For schools & cohorts", "Programs for institutions and groups, with tracking for educators."],
    ],
    paths: [["Nursing", "Pre-nursing, nursing school, NCLEX-RN and NCLEX-PN preparation."], ["Medical", "Board review such as FNP, and clinical readiness support."], ["Institutions", "Cohort onboarding and progress tracking for schools and programs."]],
    pathsTitle: "Learning paths",
    cta: "Go to InnovaCare Training",
  },
  compliance: {
    slug: "compliance", siteVar: "COMPLIANCE_URL", eyebrow: "Compliance", name: "Healthcare compliance training",
    title: "Compliance training for healthcare teams",
    image: "/photos/software/compliance.jpg", alt: "Two healthcare workers in scrubs",
    short: "Assign required training, track completion and keep certificates ready for audits, across every team and site.",
    intro: "A training platform for healthcare organizations. Bring onboarding, compliance courses, clinical modules and quizzes together, assign them by role or team, and see at a glance who has completed what, with certificates to prove it.",
    features: [
      ["check", "Course assignment", "Assign training by role, team or organization."],
      ["trending", "Learner progress", "Follow completions and catch delays before they become problems."],
      ["clipboard", "Quizzes & assessments", "Validate learning with structured assessments."],
      ["star", "Certificates", "Keep results, validations and completion history documented."],
      ["folder", "Policy library", "Centralize policies, procedures and learning resources."],
      ["users", "Manager view", "Distinct spaces for admins, managers and learners, across several sites."],
    ],
    paths: [["Home care & home health", "Pathways for coordinators and field teams."], ["Skilled nursing & hospice", "Standardized onboarding and clinical preparation."], ["Hospitals & practices", "From large departments to small clinics."], ["Compliance & policies", "Required training, procedures and traceability."]],
    pathsTitle: "Built for every care setting",
    cta: "Go to the training platform",
  },
};

export function platformProduct(slug) {
  const p = PRODUCTS[slug];
  return p ? { ...p, site: env(p.siteVar) } : null;
}
