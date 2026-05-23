import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

import { AiIntakeWidgetComponent } from './components/ai-intake-widget/ai-intake-widget.component';
import { PUBLIC_DESTINATIONS } from './data/destinations.data';
import { PUBLIC_PROFILES } from './data/profiles.data';
import { PUBLIC_SERVICES } from './data/services.data';

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

  readonly destinations = PUBLIC_DESTINATIONS.slice(0, 6);
  readonly profiles = PUBLIC_PROFILES;
  readonly services = PUBLIC_SERVICES.slice(0, 6);

  readonly dossierRows = [
    { label: 'Identity', status: 'Verified', tone: 'ok' },
    { label: 'Language test', status: 'Missing score', tone: 'warn' },
    { label: 'Proof of funds', status: 'Needs review', tone: 'review' },
    { label: 'Work letters', status: '2 uploaded', tone: 'ok' },
  ];

  readonly pathwaySteps = [
    {
      number: '01',
      title: 'Assess the profile',
      text: 'Destination, profession, family situation, budget, urgency, language and document gaps are captured before the user is pushed into a service.',
    },
    {
      number: '02',
      title: 'Build the case file',
      text: 'The dossier becomes the user’s operating base: readiness score, route, sections, tasks, documents and next best action.',
    },
    {
      number: '03',
      title: 'Prepare evidence',
      text: 'Documents are tracked by category and status so missing, rejected, expired and approved pieces are not hidden in messages.',
    },
    {
      number: '04',
      title: 'Move with context',
      text: 'Jobs, coaching, language orientation, travel readiness and human review are connected to the same case, not treated as separate products.',
    },
  ];

  readonly proofPoints = [
    'No visa or job guarantees',
    'Human review where required',
    'Tenant-ready for agencies',
    'Firebase Auth, Firestore and Storage rules',
  ];

  constructor() {
    this.title.setTitle('SYGEPEC | Premium Immigration Case & Document Platform');
    this.meta.updateTag({
      name: 'description',
      content:
        'SYGEPEC is a premium SaaS platform for immigration case preparation, document readiness, international jobs, coaching and agency workflows.',
    });
  }
}
