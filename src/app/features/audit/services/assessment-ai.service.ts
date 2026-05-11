import { Injectable } from '@angular/core';
import {
  AssessmentAnswers,
  ReadinessCategory,
  SummaryResult,
} from '../models/assessment.models';

@Injectable({ providedIn: 'root' })
export class AssessmentAiService {

  getCountryInsight(destination: string | undefined, _answers: AssessmentAnswers): string {
    switch (destination) {
      case 'canada':
        return `<strong>Très bon choix pour le Canada.</strong><br><br>
Le Canada propose plusieurs possibilités selon ton profil : études, travail, immigration économique, programmes provinciaux ou parcours professionnels réglementés. Avant de choisir une voie, il est essentiel de vérifier si ton profil est <em>administrativement prêt</em>.<br><br>
Les éléments clés à préparer : niveau de langue (IELTS/TEF), diplômes reconnus, expérience professionnelle, documents en ordre, et budget suffisant pour les frais de procédure.`;

      case 'usa':
        return `<strong>Les États-Unis — un parcours structuré à anticiper.</strong><br><br>
L'immigration américaine repose souvent sur : un visa étudiant (F-1), un visa de travail (H-1B), un parrainage par un employeur, ou le passage d'examens professionnels réglementés (NCLEX, USMLE, etc.).<br><br>
Chaque voie demande une préparation documentaire solide et, souvent, un employeur prêt à parrainer. SYGEPEC peut t'aider à structurer cette démarche étape par étape.`;

      case 'uae':
        return `<strong>Émirats Arabes Unis / Dubaï — rapidité et opportunités.</strong><br><br>
Dubaï est une destination attractive pour les professionnels de santé, de l'ingénierie, de la finance et de la technologie. Le processus repose généralement sur : une offre d'emploi, la vérification de tes diplômes auprès du DHA ou MOH, et la soumission de tes documents professionnels.<br><br>
La vitesse de traitement est un avantage, mais la conformité documentaire est non négociable.`;

      case 'qatar':
        return `<strong>Qatar — opportunités professionnelles croissantes.</strong><br><br>
Le Qatar investit massivement dans sa main-d'œuvre étrangère. Pour les professionnels (notamment la santé, l'ingénierie, la construction), la voie passe par : offre d'employeur, vérification des diplômes par le QCHP ou autre régulateur, et soumission du dossier complet.<br><br>
SYGEPEC peut t'aider à anticiper chaque document requis selon ta profession.`;

      case 'europe':
        return `<strong>Europe — diversité de destinations et de programmes.</strong><br><br>
L'Europe offre de multiples pays : France, Allemagne, Belgique, Portugal, Espagne... Chaque pays a ses propres exigences. Certains proposent des voies pour les professionnels qualifiés, d'autres pour les étudiants ou les entrepreneurs.<br><br>
SYGEPEC t'aidera à identifier la destination la plus alignée avec ton profil, tes diplômes et ton objectif.`;

      default:
        return `<strong>Pas encore sûr de ta destination ? C'est normal.</strong><br><br>
Choisir une destination sans analyser son profil peut mener à des erreurs coûteuses. SYGEPEC va cartographier ton profil — diplômes, expérience, langue, budget, documents — et te proposer les destinations les plus adaptées à ta situation réelle.<br><br>
Tu peux avancer maintenant et affiner ta destination plus tard.`;
    }
  }

  getCountryInsightCards(destination: string | undefined): { label: string; icon: string }[] {
    const base = [
      { label: 'Langue', icon: '🗣️' },
      { label: 'Diplômes', icon: '🎓' },
      { label: 'Expérience', icon: '💼' },
      { label: 'Documents', icon: '📁' },
      { label: 'Budget', icon: '💰' },
      { label: 'Objectif', icon: '🎯' },
    ];
    if (destination === 'usa') {
      return [
        { label: 'Visa', icon: '📋' },
        { label: 'Examens', icon: '📝' },
        { label: 'Employeur', icon: '🏢' },
        { label: 'Documents', icon: '📁' },
        { label: 'Budget', icon: '💰' },
        { label: 'Timeline', icon: '📅' },
      ];
    }
    return base;
  }

  getAuditExplanation(awareness: string | undefined): string {
    if (awareness === 'yes') {
      return `<strong>Parfait — tu as déjà fait ton audit.</strong><br><br>
Nous allons tout de même collecter tes informations clés pour structurer ton dossier SYGEPEC, vérifier les points critiques et identifier les documents manquants ou à renouveler.`;
    }
    return `<strong>Qu'est-ce qu'un audit personnel immigration ?</strong><br><br>
C'est une analyse de ton profil <em>avant</em> de commencer une procédure. On examine : ton âge, tes études, ton expérience professionnelle, ton niveau de langue, ton budget, tes documents disponibles et ton objectif final.<br><br>
C'est ce qui donne vie à ton dossier sur le plan administratif. <strong>Sans audit, tu risques de choisir une mauvaise voie</strong>, perdre du temps ou préparer des documents inutiles — voire perdre de l'argent dans des démarches vouées à l'échec.`;
  }

  calculateReadinessScore(answers: AssessmentAnswers): number {
    let score = 0;
    if (answers.destinationCountry) score += 10;
    if (answers.immigrationGoal) score += 10;
    if (answers.fullName && answers.email && answers.phone && answers.nationality) score += 10;
    if (answers.age && answers.maritalStatus) score += 10;
    if (answers.educationLevel) score += 15;
    if (answers.profession && answers.yearsExperience) score += 15;
    if (answers.frenchLevel || answers.englishLevel) score += 10;
    if (answers.budgetAvailable) score += 10;
    if (answers.documentsAvailable && answers.documentsAvailable.length > 0) score += 10;
    return Math.min(score, 100);
  }

  getReadinessCategory(score: number): ReadinessCategory {
    if (score <= 30) return 'Profil incomplet';
    if (score <= 60) return 'Profil à construire';
    if (score <= 80) return 'Profil prometteur à vérifier';
    return 'Prêt pour revue humaine';
  }

  calculateMissingItems(answers: AssessmentAnswers): string[] {
    const missing: string[] = [];
    if (!answers.destinationCountry) missing.push('Destination de voyage');
    if (!answers.immigrationGoal) missing.push('Objectif d\'immigration');
    if (!answers.fullName || !answers.email) missing.push('Informations d\'identité complètes');
    if (!answers.age) missing.push('Âge et profil personnel');
    if (!answers.educationLevel) missing.push('Niveau d\'études');
    if (!answers.profession) missing.push('Expérience professionnelle');
    if (!answers.frenchLevel && !answers.englishLevel) missing.push('Niveau de langue');
    if (!answers.budgetAvailable) missing.push('Budget prévu');
    if (!answers.documentsAvailable || answers.documentsAvailable.length === 0) missing.push('Documents disponibles');
    return missing;
  }

  getMissingDocuments(answers: AssessmentAnswers): string[] {
    const docs = answers.documentsAvailable || [];
    const allDocs = ['passport', 'diploma', 'transcripts', 'work_letter', 'birth_cert', 'police_cert', 'proof_funds', 'language_test', 'cv'];
    const labels: Record<string, string> = {
      passport: 'Passeport valide',
      diploma: 'Diplôme',
      transcripts: 'Relevés de notes',
      work_letter: 'Attestation de travail',
      birth_cert: 'Acte de naissance',
      police_cert: 'Casier judiciaire',
      proof_funds: 'Preuve de fonds',
      language_test: 'Test de langue',
      cv: 'CV à jour',
    };
    return allDocs.filter(d => !docs.includes(d)).map(d => labels[d] || d);
  }

  getStrengths(answers: AssessmentAnswers): string[] {
    const strengths: string[] = [];
    if (answers.destinationCountry) strengths.push('Destination définie');
    if (answers.immigrationGoal) strengths.push('Objectif clair');
    if (answers.educationLevel && answers.educationLevel !== 'other') strengths.push('Niveau d\'éducation documenté');
    if (answers.yearsExperience && answers.yearsExperience >= 2) strengths.push(`${answers.yearsExperience} ans d'expérience professionnelle`);
    if (answers.frenchLevel && answers.frenchLevel !== 'none') strengths.push('Niveau de français évalué');
    if (answers.englishLevel && answers.englishLevel !== 'none') strengths.push('Niveau d\'anglais évalué');
    if (answers.budgetAvailable && answers.budgetAvailable > 0) strengths.push('Budget anticipé');
    if (answers.documentsAvailable && answers.documentsAvailable.length >= 3) strengths.push(`${answers.documentsAvailable.length} documents déjà disponibles`);
    return strengths.length ? strengths : ['Démarrage du dossier'];
  }

  getRecommendations(answers: AssessmentAnswers): string[] {
    const recs: string[] = [];
    if (!answers.frenchLevel && !answers.englishLevel) {
      recs.push('Passer un test de langue officiel (IELTS, TEF, OET)');
    }
    if (!answers.documentsAvailable?.includes('passport')) {
      recs.push('Renouveler ou obtenir un passeport valide');
    }
    if (!answers.documentsAvailable?.includes('diploma')) {
      recs.push('Récupérer votre diplôme original et le faire légaliser');
    }
    if (!answers.documentsAvailable?.includes('police_cert')) {
      recs.push('Obtenir un casier judiciaire récent (moins de 3 mois)');
    }
    if (answers.destinationCountry === 'canada') {
      recs.push('Créer un profil Express Entry ou PEQ selon ton objectif');
    }
    if (answers.destinationCountry === 'usa') {
      recs.push('Rechercher les examens professionnels requis (NCLEX, USMLE...)');
    }
    if (!answers.budgetAvailable) {
      recs.push('Estimer le budget total : frais de dossier, déplacement, installation');
    }
    if (recs.length === 0) {
      recs.push('Planifier une revue humaine pour valider votre dossier');
      recs.push('Suivre la formation SYGEPEC adaptée à votre destination');
    }
    return recs;
  }

  generateRecommendedPrograms(answers: AssessmentAnswers): string[] {
    const destination = answers.destinationCountry;
    const profession = (answers.profession || '').toLowerCase();
    const docs = answers.documentsAvailable || [];
    const programs: string[] = [];

    if (!answers.languageTestTaken || answers.languageTestTaken === 'no') {
      if (destination === 'canada' || destination === 'usa' || destination === 'uae' || destination === 'qatar') {
        programs.push('IELTS/OET Preparation');
      }
    }

    if (profession.includes('nurse') || profession.includes('infirm')) {
      if (destination === 'usa') programs.push('NCLEX Starter Program');
      if (destination === 'uae') programs.push('DHA/DOH UAE Nursing Roadmap');
      programs.push('Global Nurse Licensing Starter Pack');
    }

    if (docs.length < 3 || docs.includes('none')) {
      programs.push('Document Preparation Mini Course');
    }

    if (!destination || destination === 'unknown') {
      programs.push('Destination Strategy Session');
    }

    return [...new Set(programs)];
  }

  generateNextBestAction(answers: AssessmentAnswers): string {
    if (!answers.documentsAvailable || answers.documentsAvailable.length === 0 || answers.documentsAvailable.includes('none')) {
      return 'Rassembler les documents essentiels: passeport, diplôme et preuves d\'expérience.';
    }
    if (!answers.languageTestTaken || answers.languageTestTaken === 'no') {
      return 'Planifier un test de langue officiel pour renforcer ton dossier.';
    }
    if (!answers.proofOfFundsAvailable || answers.proofOfFundsAvailable === 'no') {
      return 'Préparer une preuve de fonds conforme aux exigences de ta destination.';
    }
    return 'Demander une revue humaine SYGEPEC pour valider la prochaine soumission.';
  }

  generateSummary(answers: AssessmentAnswers): SummaryResult {
    const score = this.calculateReadinessScore(answers);
    const destinationLabels: Record<string, string> = {
      canada: 'Canada',
      usa: 'États-Unis',
      uae: 'UAE / Dubaï',
      qatar: 'Qatar',
      europe: 'Europe',
      unknown: 'À déterminer',
    };
    const goalLabels: Record<string, string> = {
      study: 'Études',
      work: 'Travail',
      permanent: 'Résidence permanente',
      family: 'Rejoindre la famille',
      business: 'Créer une entreprise',
      unknown: 'À définir',
    };

    let nextAction = this.generateNextBestAction(answers);
    if (score >= 81) nextAction = 'Votre profil est prêt pour une revue humaine SYGEPEC.';

    return {
      destination: destinationLabels[answers.destinationCountry || ''] || 'À déterminer',
      goal: goalLabels[answers.immigrationGoal || ''] || 'À définir',
      strengths: this.getStrengths(answers),
      gaps: this.calculateMissingItems(answers),
      missingDocuments: this.getMissingDocuments(answers),
      recommendations: [...this.getRecommendations(answers), ...this.generateRecommendedPrograms(answers)],
      readinessScore: score,
      readinessCategory: this.getReadinessCategory(score),
      nextAction,
    };
  }
}
