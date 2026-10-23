import { getFirebaseSession } from "@/lib/auth";
import { listClientReturns } from "@/lib/data";
import { setDocument, TAX_TENANT } from "@/lib/firebase";
import { mutationGuard, privateHeaders, sanitizeIntake } from "@/lib/security";

const blankMoney = {
  w2Wages: "", w2Withheld: "", selfEmployment: "", interest: "",
  dividends: "", unemployment: "", retirement: "", other: "",
};

const blankDeductions = {
  mortgageInterest: "", propertyTax: "", charity: "", studentLoan: "", childcare: "",
};

export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  if (!session || session.role !== "CLIENT")
    return Response.json({ error: "Authentication required." }, { status: 401, headers: privateHeaders });

  const returns = await listClientReturns(session.uid);
  const source = returns[0];
  if (!source)
    return Response.json({ error: "No prior return was found." }, { status: 404, headers: privateHeaders });
  if (!["FILED", "ACCEPTED"].includes(source.status))
    return Response.json({ error: "Your current return must be filed before starting the next tax year." }, { status: 409, headers: privateHeaders });

  const nextYear = Number(source.tax_year) + 1;
  const returnId = `${session.uid}_${nextYear}`;
  const prior = sanitizeIntake(source.intake);
  const now = new Date().toISOString();
  const intake = {
    personal: prior.personal,
    filingStatus: prior.filingStatus,
    spouse: prior.spouse,
    dependents: prior.dependents,
    income: blankMoney,
    deductions: blankDeductions,
    refund: { method: prior.refund.method, accountLast4: "" },
    submitted: false,
  };

  try {
    await setDocument(`taxReturns/${returnId}`, {
      tenantId: TAX_TENANT,
      clientId: session.uid,
      clientName: source.client_name,
      clientEmail: source.client_email,
      clientPhone: prior.personal.phone || source.client_phone || null,
      preparerId: null,
      preparerName: null,
      taxYear: nextYear,
      status: "INTAKE",
      filingStatus: prior.filingStatus || null,
      intake,
      docCount: 0,
      signatureStatus: "NOT_REQUESTED",
      signatureMethod: "REMOTE",
      signatureRequestedAt: null,
      signedAt: null,
      submissionStatus: "NOT_READY",
      submissionReference: null,
      submissionNotes: null,
      submittedAt: null,
      acceptedAt: null,
      carryForwardFromReturnId: source.id,
      carryForwardFromTaxYear: source.tax_year,
      createdAt: now,
      updatedAt: now,
    }, session.idToken, { createOnly: true });
    return Response.json({ ok: true, id: returnId, taxYear: nextYear }, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error.status === 409 || String(error.code || "").includes("ALREADY_EXISTS"))
      return Response.json({ error: `Your ${nextYear} return already exists.` }, { status: 409, headers: privateHeaders });
    return Response.json({ error: "The next tax year could not be created." }, { status: 503, headers: privateHeaders });
  }
}
