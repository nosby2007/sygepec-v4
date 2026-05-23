import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PublicHeroComponent } from '../../components/public-hero/public-hero.component';
import { PublicSectionHeaderComponent } from '../../components/public-section-header/public-section-header.component';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PublicHeroComponent, PublicSectionHeaderComponent],
  template: `
    <app-public-hero
      eyebrow="Consultation and support"
      title="Tell SYGEPEC what you are preparing."
      description="Share your destination, profile, urgency and support need so the team can route you toward assessment, document review, service support or agency partnership."
      [primaryCta]="{ label: 'Start Assessment first', url: '/start-audit' }"
      [secondaryCta]="{ label: 'Sign in', url: '/auth/login' }"
      visualLabel="Consultation intake"
      [visualTags]="['Profile', 'Need', 'Destination', 'Urgency']"
      imageUrl="/assets/marketing/sygepec-hero-global.png"
      imageAlt="SYGEPEC consultation and global dossier readiness visual"
      [compact]="true"
    />
    <section class="pub-section pub-section--white">
      <div class="sy-public-container pub-grid-2">
        <div>
          <app-public-section-header
            align="left"
            eyebrow="Contact"
            title="A useful message starts with context."
            description="This intake shell prepares the Lot 6 consultation experience. For now it keeps the user path clear and encourages assessment-first onboarding."
          />
          <div class="pub-card">
            <h3>Response expectation</h3>
            <p>For urgent document or case questions, sign in and use support when possible. For partnerships, include organization type, country and expected client volume.</p>
          </div>
        </div>

        <form class="pub-contact-form" (ngSubmit)="submit()" #form="ngForm">
          <label>
            Full name
            <input name="name" required [(ngModel)]="name" />
          </label>
          <label>
            Email
            <input name="email" required type="email" [(ngModel)]="email" />
          </label>
          <label>
            Need
            <select name="need" required [(ngModel)]="need">
              <option value="assessment">Start assessment</option>
              <option value="document-review">Document review</option>
              <option value="job-support">International job support</option>
              <option value="agency">Agency / partner access</option>
            </select>
          </label>
          <label>
            Destination
            <select name="destination" required [(ngModel)]="destination">
              <option>Canada</option>
              <option>USA</option>
              <option>UK</option>
              <option>UAE</option>
              <option>Europe</option>
              <option>Australia</option>
              <option>Not sure yet</option>
            </select>
          </label>
          <label>
            Message
            <textarea name="message" rows="5" required [(ngModel)]="message"></textarea>
          </label>
          <button class="pub-btn pub-btn--primary" type="submit" [disabled]="form.invalid">
            Prepare consultation request
          </button>
          <p class="pub-contact-form__note" *ngIf="submitted()">
            Your request is structured. The next production step will connect this form to secure lead or support routing.
          </p>
        </form>
      </div>
    </section>
  `,
  styles: [`
    .pub-contact-form {
      display: grid;
      gap: 14px;
      border: 1px solid var(--sy-public-border);
      border-radius: 24px;
      padding: 22px;
      background: #fff;
      box-shadow: var(--sy-public-shadow);
    }
    .pub-contact-form label {
      display: grid;
      gap: 7px;
      color: var(--sy-public-ink);
      font-size: .82rem;
      font-weight: 900;
    }
    .pub-contact-form input,
    .pub-contact-form select,
    .pub-contact-form textarea {
      width: 100%;
      border: 1px solid rgba(16,32,51,.14);
      border-radius: 12px;
      padding: 12px 13px;
      font: inherit;
      color: var(--sy-public-text);
      background: #fbfdff;
    }
    .pub-contact-form button:disabled {
      opacity: .55;
      cursor: not-allowed;
    }
    .pub-contact-form__note {
      margin: 0;
      color: var(--sy-success);
      line-height: 1.55;
      font-weight: 700;
    }
  `],
})
export class ContactPageComponent {
  readonly submitted = signal(false);
  name = '';
  email = '';
  need = 'assessment';
  destination = 'Not sure yet';
  message = '';

  submit(): void {
    this.submitted.set(true);
  }
}
