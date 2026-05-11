import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { AiIntakeWidgetComponent } from './components/ai-intake-widget/ai-intake-widget.component';

@Component({
  selector: 'app-public-home',
  standalone: true,
  imports: [CommonModule, RouterLink, AiIntakeWidgetComponent],
  templateUrl: './public-home.component.html',
  styleUrls: ['./public-home.component.scss'],
})
export class PublicHomeComponent {
  private title = inject(Title);
  private meta = inject(Meta);

  constructor() {
    this.title.setTitle('SYGEPEC | AI-Assisted Immigration Audit, Document Readiness & Relocation Pathway');
    this.meta.updateTag({
      name: 'description',
      content: 'Start your immigration journey with SYGEPEC. Complete a personal audit, organize documents, receive training recommendations, and prepare travel readiness with AI-assisted guidance and human review.',
    });
  }

  readonly confusionPoints = [
    {
      title: 'Informations dispersées',
      description: 'Les exigences changent vite et sont souvent dispersées entre groupes, agents et sites non officiels.',
      icon: 'travel_explore',
    },
    {
      title: 'Documents incomplets',
      description: 'Beaucoup de dossiers échouent à cause de documents manquants, expirés ou mal préparés.',
      icon: 'folder_open',
    },
    {
      title: 'Mauvaises décisions de parcours',
      description: 'Sans audit personnel, on peut choisir une voie non adaptée et perdre du temps et de l\'argent.',
      icon: 'schedule',
    },
  ];

  readonly flow = [
    { step: '01', title: 'Destination', description: 'Choisir un pays cible ou comparer les options adaptées à ton profil.' },
    { step: '02', title: 'Audit personnel', description: 'Analyser âge, études, expérience, langue, budget et objectif.' },
    { step: '03', title: 'Documents', description: 'Identifier les pièces manquantes et prioriser leur préparation.' },
    { step: '04', title: 'Formation', description: 'Recommander les formations utiles selon ton parcours et ta destination.' },
    { step: '05', title: 'Voyage', description: 'Préparer la relocation: vol, logement et checklist d\'arrivée.' },
    { step: '06', title: 'Revue humaine', description: 'Valider les points critiques avant toute soumission officielle.' },
  ];

  readonly destinations = [
    { name: 'Canada', summary: 'Entrée express, programmes provinciaux, études et travail qualifié' },
    { name: 'États-Unis', summary: 'Études, travail, licensing professionnel et parrainage employeur' },
    { name: 'UAE / Dubaï', summary: 'Parcours emploi, vérification de diplômes et conformité documentaire' },
    { name: 'Qatar', summary: 'Voies professionnelles avec exigences documentaires structurées' },
    { name: 'Europe', summary: 'Parcours variés selon pays: études, travail, mobilité professionnelle' },
    { name: 'Je ne sais pas encore', summary: 'SYGEPEC compare les destinations selon ton profil réel' },
  ];

  readonly readiness = [
    { title: 'Profil personnel', description: 'Âge, situation familiale, nationalité et pays de résidence.' },
    { title: 'Études et expérience', description: 'Diplômes, relevés, profession, années d\'expérience et preuves.' },
    { title: 'Langue et budget', description: 'Niveaux de langue, tests disponibles, budget et preuve de fonds.' },
    { title: 'Pré-vérification documentaire', description: 'Passeport, casier, actes, CV et pièces à compléter.' },
    { title: 'Formation recommandée', description: 'IELTS/OET, NCLEX, DHA/DOH et préparation administrative.' },
    { title: 'Préparation voyage', description: 'Readiness relocation: vol, logement, assurance et arrivée.' },
  ];
}
