// Guided tours of the client portal. Each step points at an element (CSS selector, or a
// card found by its heading) and explains it. A step whose element is not on the page is
// skipped, so a tour never breaks when a card is hidden. Steps without a target are shown
// in the middle of the screen.

export const TOUR_VERSION = 1;

const side = (label) => `#side-${label.toLowerCase().replace(/\W+/g, "-")}`;

const TAX_PORTAL = {
  id: "portal-tax",
  title: "Your client portal",
  steps: [
    { title: "Welcome to your client portal", body: "Your tax return happens in five stages: answer the questionnaire, upload your documents, talk with your preparer, sign Form 8879, then follow the filing. This short tour shows where each one lives." },
    { target: "#next-step-cta", title: "Your next step", body: "This button always shows what to do next. Click it and you land on the right page." },
    { heading: "Return progress", title: "Where your return stands", body: "The six stages, from questionnaire to IRS acceptance. Your preparer moves your return forward; you see each change here." },
    { target: side("Tax Questionnaire"), title: "Stage 1 · Questionnaire", body: "One question at a time. You can upload your W-2 and 1099s and the boxes fill themselves for you to check. Answers save as you go, so you can stop and resume on any device." },
    { target: side("Documents"), title: "Stage 2 · Documents", body: "Your personal checklist of what to send, built from your answers. Uploads are encrypted and go straight to your preparer." },
    { target: side("Appointments"), title: "Meet your preparer", body: "Book a call, a video meeting or an office visit when it suits you." },
    { target: side("Messages"), title: "Stage 3 · Secure messages", body: "Ask questions and answer your preparer's here, never by plain email. You get an answer within one business day." },
    { heading: "Form 8879 signature", title: "Stage 4 · Sign online", body: "When your return is ready, a button appears to review it and sign Form 8879. If a fee is due, you pay it securely first." },
    { heading: "E-file submission", title: "Stage 5 · Follow the filing", body: "Your preparer files your return with their professional software after you sign. You see when it is submitted and when the IRS accepts it." },
    { target: side("Tax Years"), title: "Past and next years", body: "Your returns by year. Once this year is filed, you start next year here: your details carry over, never last year's amounts." },
    { target: side("Support"), title: "Need help?", body: "Open a support request for anything about your account or the portal." },
    { target: side("Security"), title: "Protect your account", body: "Turn on two-step sign-in and see your recent sign-ins." },
    { target: "#tour-guide-btn", title: "Replay this guide anytime", body: "Click Guide on any page for a tour of that page." },
  ],
};

const BUSINESS_PORTAL = {
  id: "portal-business",
  title: "Your business workspace",
  steps: [
    { title: "Welcome to your business workspace", body: "Run bookings, customers, invoices and payments, and keep your books ready for tax time. This tour shows where everything is." },
    { target: side("Business Overview"), title: "Overview", body: "Today's appointments, money coming in and what needs your attention." },
    { target: side("Bookings"), title: "Bookings", body: "Your calendar. Customers book online from your public page; you confirm, move or cancel here." },
    { target: side("Customers"), title: "Customers", body: "Everyone who booked or paid, with their history and notes." },
    { target: side("Services & Billing"), title: "Services and billing", body: "Your services and prices, invoices and pay links. Send a link and the customer pays online." },
    { target: side("Plan & payments"), title: "Get paid", body: "Connect your bank account once, through Stripe, to receive online payments. Your plan is managed here too." },
    { target: side("Public page"), title: "Your public page", body: "What customers see: your services, photos, hours and online booking." },
    { target: side("Growth hub"), title: "Grow", body: "Reminders, reviews and campaigns to bring customers back." },
    { target: side("Team"), title: "Your team", body: "Invite staff and choose what each person can see and do." },
    { target: side("Accounting"), title: "Books and taxes", body: "Income and expenses through the year, a tax set-aside, and a year-end package for your preparer." },
    { target: side("Support"), title: "Need help?", body: "Open a support request for anything about your workspace." },
    { target: "#tour-guide-btn", title: "Replay this guide anytime", body: "Click Guide on any page for a tour of that page." },
  ],
};

const INTAKE = {
  id: "intake",
  title: "The questionnaire",
  steps: [
    { title: "How the questionnaire works", body: "One question per screen, in six sections. It takes 15 to 25 minutes, and you can stop whenever you like." },
    { target: ".ix-sections", title: "Sections", body: "Where you are. Once a section is done you can jump back to it here." },
    { target: ".ix-title", title: "One question at a time", body: "Read the question, choose an answer, then Continue. Not sure? Pick your best guess: your preparer checks everything." },
    { target: ".ix-upload", title: "Upload instead of typing", body: "Drop your W-2s, 1099s and other forms. Each one is recognised and its boxes are filled for you. Always check the amounts against your paper form." },
    { target: ".ix-step-meta", title: "Saved automatically", body: "Every answer is saved within seconds. Sign in on another device and you land on this exact screen." },
    { target: ".ix-estimate", title: "Live estimate", body: "Your federal refund or balance due, updated as you answer. It is an estimate: your preparer confirms the real figures." },
    { target: ".ix-issues-mini", title: "Double-check", body: "Anything missing or inconsistent shows here, with a button to fix it. Items marked Must fix block the submission." },
    { target: ".ix-nav", title: "Back and Continue", body: "Move between screens. Nothing is lost when you go back." },
  ],
};

const DOCUMENTS = {
  id: "documents",
  title: "Documents",
  steps: [
    { heading: "Your checklist", title: "What to send", body: "Built from your questionnaire. Each item turns green once received." },
    { target: "#doc-type", title: "Choose the document", body: "Pick what you are uploading so your preparer finds it at once." },
    { target: ".dropzone", title: "Drop your files", body: "PDF or photos, up to 10 MB each. Files are scanned and encrypted, and only your preparer can open them." },
    { heading: "Uploaded files", title: "Your files", body: "Everything you sent. You can remove a file until your return is filed." },
  ],
};

// The tour for a page: page tours first, then the portal tour for the home page.
export function tourFor(path, accountType) {
  if (path === "/portal/intake") return INTAKE;
  if (path === "/portal/documents") return DOCUMENTS;
  if (accountType === "BUSINESS") return BUSINESS_PORTAL;
  return TAX_PORTAL;
}

// Tours that start by themselves the first time a page is opened.
export function autoTourFor(path, accountType) {
  if (accountType === "BUSINESS") return path === "/portal/business" ? BUSINESS_PORTAL : null;
  if (path === "/portal") return TAX_PORTAL;
  if (path === "/portal/intake") return INTAKE;
  if (path === "/portal/documents") return DOCUMENTS;
  return null;
}

export const ALL_TOURS = [TAX_PORTAL, BUSINESS_PORTAL, INTAKE, DOCUMENTS];
