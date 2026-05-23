import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { AuthService } from '../../core/auth/auth-state.service';
import { AUTH_UI_STYLES } from './auth-ui.styles';

@Component({
  standalone: true,
  selector: 'app-forgot-password',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatIconModule],
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
          <p class="auth-eyebrow">Account recovery</p>
          <h1>Recuperez l'acces sans perdre votre parcours.</h1>
          <p>
            Entrez l'adresse email de votre compte. Si elle correspond a un espace SYGEPEC, vous
            recevrez un lien de reinitialisation Firebase Auth.
          </p>
          <div class="auth-proof" aria-label="Securite de recuperation">
            <div>
              <strong>Email uniquement</strong>
              <span>Nous n'affichons pas si un compte existe afin de proteger les utilisateurs.</span>
            </div>
            <div>
              <strong>Dossier conserve</strong>
              <span>Vos dossiers, documents et demandes restent lies a votre compte.</span>
            </div>
            <div>
              <strong>Retour rapide</strong>
              <span>Apres reset, reconnectez-vous pour reprendre dashboard et checklist.</span>
            </div>
          </div>
        </section>

        <section class="auth-panel" aria-labelledby="forgot-title">
          <p class="panel-label">Password reset</p>
          <h2 id="forgot-title" class="auth-title">Reinitialiser mon mot de passe</h2>
          <p class="auth-sub">
            Utilisez l'email associe a votre audit ou dossier. Verifiez aussi vos spams si le
            message n'arrive pas rapidement.
          </p>

          <form [formGroup]="form" (ngSubmit)="sendReset()">
            <mat-form-field appearance="outline" class="auth-field">
              <mat-label>Adresse e-mail</mat-label>
              <input matInput formControlName="email" type="email" autocomplete="email" />
              <mat-icon matSuffix>mail_outline</mat-icon>
            </mat-form-field>

            <div *ngIf="success" class="auth-success">{{ success }}</div>
            <div *ngIf="error" class="auth-error">{{ error }}</div>

            <button class="auth-submit" type="submit" [disabled]="form.invalid || loading">
              {{ loading ? 'Envoi en cours...' : 'Envoyer le lien de reinitialisation' }}
            </button>

            <div class="auth-links">
              <a routerLink="/auth/login" class="auth-link">Retour a la connexion</a>
              <a routerLink="/auth/register" class="auth-link auth-link-muted">Creer un compte</a>
            </div>

            <p class="security-note">
              Pour votre securite, SYGEPEC ne communique jamais de mot de passe par email. Le lien
              de reinitialisation est gere par Firebase Auth.
            </p>
          </form>
        </section>
      </div>
    </main>
  `,
  styles: [AUTH_UI_STYLES],
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  loading = false;
  error = '';
  success = '';

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async sendReset(): Promise<void> {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      await this.auth.resetPassword(this.form.value.email!);
      this.success = 'Si un compte SYGEPEC utilise cet email, un lien de reinitialisation vient d etre envoye.';
    } catch (err: any) {
      this.error = err?.message || 'Impossible d envoyer le lien pour le moment.';
    } finally {
      this.loading = false;
    }
  }
}
