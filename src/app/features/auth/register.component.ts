import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { AuthService } from '../../core/auth/auth-state.service';
import { AUTH_UI_STYLES } from './auth-ui.styles';

@Component({
  standalone: true,
  selector: 'app-register',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <main class="auth-page">
      <div class="auth-grid">
        <section class="auth-story">
          <a routerLink="/public" class="auth-brand" aria-label="Retour au site public SYGEPEC">
            <span class="auth-brand-mark">S</span>
            <div>
              <div class="auth-brand-name">SYGEPEC</div>
              <div class="auth-brand-sub">Immigration operating system</div>
            </div>
          </a>
          <p class="auth-eyebrow">Candidate onboarding</p>
          <h1>Transformez votre audit en dossier suivi.</h1>
          <p>
            Creez votre espace pour sauvegarder votre profil, suivre les documents manquants,
            recevoir les prochaines actions et preparer vos services immigration, emploi et
            accompagnement.
          </p>
          <div class="auth-proof" aria-label="Ce que votre compte active">
            <div>
              <strong>Dossier personnel</strong>
              <span>Un espace structure autour de votre destination, objectif et readiness.</span>
            </div>
            <div>
              <strong>Document vault</strong>
              <span>Checklist, upload, corrections et revue humaine dans un flux clair.</span>
            </div>
            <div>
              <strong>Services premium</strong>
              <span>Demandes de review, CV, coaching, support et opportunites internationales.</span>
            </div>
          </div>
        </section>

        <section class="auth-panel" aria-labelledby="register-title">
          <p class="panel-label">Create account</p>
          <h2 id="register-title" class="auth-title">Creer mon espace SYGEPEC</h2>
          <p class="auth-sub">
            Votre compte sera cree comme profil client. Le code agence reste optionnel et peut etre
            ajoute plus tard par l'equipe SYGEPEC.
          </p>

          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="auth-field">
              <mat-label>Nom complet</mat-label>
              <input matInput formControlName="displayName" autocomplete="name" />
              <mat-icon matSuffix>person_outline</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="auth-field">
              <mat-label>Adresse e-mail</mat-label>
              <input matInput formControlName="email" type="email" autocomplete="email" />
              <mat-icon matSuffix>mail_outline</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="auth-field">
              <mat-label>Mot de passe</mat-label>
              <input matInput formControlName="password" type="password" autocomplete="new-password" />
              <mat-icon matSuffix>lock_outline</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="auth-field">
              <mat-label>Code agence ou organisation (optionnel)</mat-label>
              <input matInput formControlName="tenantId" autocomplete="organization" />
              <mat-icon matSuffix>business_outline</mat-icon>
            </mat-form-field>

            <div class="form-row">
              <span class="mini-note">Sans code agence, votre compte est rattache a SYGEPEC principal.</span>
            </div>

            <div *ngIf="error" class="auth-error">{{ error }}</div>

            <button class="auth-submit" type="submit" [disabled]="form.invalid || loading">
              {{ loading ? 'Creation en cours...' : 'Creer mon compte' }}
            </button>

            <div class="auth-links">
              <a routerLink="/auth/login" [queryParams]="loginQueryParams()" class="auth-link">
                Deja inscrit ? Se connecter
              </a>
            </div>

            <p class="security-note">
              En creant un compte, vous acceptez que SYGEPEC organise les informations necessaires
              au suivi de votre dossier. Aucune approbation officielle n'est garantie.
            </p>
          </form>
        </section>
      </div>
    </main>
  `,
  styles: [AUTH_UI_STYLES],
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loading = false;
  error = '';

  form = this.fb.group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    tenantId: [''],
  });

  loginQueryParams(): Record<string, string | number> {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const draft = this.route.snapshot.queryParamMap.get('draft');
    const params: Record<string, string | number> = {};
    if (returnUrl) params['returnUrl'] = returnUrl;
    if (draft) params['draft'] = draft;
    return params;
  }

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';

    const { displayName, email, password, tenantId } = this.form.value;
    try {
      await this.auth.register(email!, password!, displayName!, tenantId!);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
      const hasDraft = this.route.snapshot.queryParamMap.get('draft') === '1';
      if (hasDraft && returnUrl === '/start-audit') {
        this.router.navigate(['/start-audit'], { queryParams: { resume: 1 } });
        return;
      }
      this.router.navigateByUrl(returnUrl);
    } catch (err: any) {
      this.error = err.message || 'Registration failed';
    } finally {
      this.loading = false;
    }
  }
}
