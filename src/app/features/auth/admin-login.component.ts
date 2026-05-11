import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth-state.service';
import { AuthContextService } from '../../core/auth/auth-context.service';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

/**
 * Admin Login (espace réservé staff / admin / super-admin).
 * Si le compte n'a pas de rôle admin, déconnexion immédiate et message d'erreur.
 */
@Component({
  standalone: true,
  selector: 'app-admin-login',
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
    <div class="auth-bg">
      <div class="auth-card">

        <div class="auth-brand">
          <span class="auth-brand-mark">
            <mat-icon>shield_person</mat-icon>
          </span>
          <div>
            <div class="auth-brand-name">SYGEPEC · ADMIN</div>
            <div class="auth-brand-sub">Console d'administration sécurisée</div>
          </div>
        </div>

        <div class="auth-badge">
          <mat-icon>lock</mat-icon>
          <span>Accès réservé au personnel SYGEPEC</span>
        </div>

        <h1 class="auth-title">Connexion Admin</h1>
        <p class="auth-sub">Authentifiez-vous avec votre compte staff, admin ou super-admin.</p>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <mat-form-field appearance="outline" class="auth-field">
            <mat-label>Adresse e-mail professionnelle</mat-label>
            <input matInput formControlName="email" type="email" autocomplete="email" />
            <mat-icon matSuffix>mail_outline</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline" class="auth-field">
            <mat-label>Mot de passe</mat-label>
            <input matInput formControlName="password" type="password" autocomplete="current-password" />
            <mat-icon matSuffix>lock_outline</mat-icon>
          </mat-form-field>

          <div *ngIf="error" class="auth-error">{{ error }}</div>

          <button class="auth-submit" type="submit" [disabled]="form.invalid || loading">
            {{ loading ? 'Vérification...' : 'Accéder à la console' }}
          </button>

          <a routerLink="/auth/login" class="auth-link">Vous êtes un client SYGEPEC ? Connexion utilisateur →</a>
        </form>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .auth-bg {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background:
        radial-gradient(ellipse at 18% 28%, rgba(192,57,43,.32), transparent 46%),
        radial-gradient(ellipse at 82% 80%, rgba(245,184,65,.18), transparent 42%),
        linear-gradient(155deg, #0a0f1c, #1a1330 56%, #2a0d1d);
      padding: 24px;
    }
    .auth-card {
      width: 100%;
      max-width: 440px;
      background: #0e1424;
      color: #e8edf6;
      border-radius: 22px;
      padding: 38px 34px 32px;
      box-shadow: 0 36px 78px rgba(0,0,0,.55);
      border: 1px solid rgba(245,184,65,.18);
    }
    .auth-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .auth-brand-mark {
      width: 46px; height: 46px; border-radius: 12px;
      display: grid; place-items: center;
      background: linear-gradient(135deg, #f5b841, #c0392b);
      color: #fff;
      box-shadow: 0 8px 22px rgba(192,57,43,.42);
    }
    .auth-brand-mark mat-icon { color: #fff; }
    .auth-brand-name { font-weight: 800; font-size: 14px; letter-spacing: .12em; color: #f5b841; }
    .auth-brand-sub { font-size: 11px; color: #94a0b6; margin-top: 2px; }
    .auth-badge {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 700; letter-spacing: .08em;
      padding: 6px 12px; border-radius: 999px; margin-bottom: 18px;
      background: rgba(245,184,65,.12); color: #f5b841;
      border: 1px solid rgba(245,184,65,.32);
      text-transform: uppercase;
    }
    .auth-badge mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .auth-title { margin: 0 0 6px; font-size: 1.7rem; font-weight: 800; color: #fff; letter-spacing: -.02em; }
    .auth-sub { margin: 0 0 22px; font-size: .88rem; color: #a8b3c7; }
    .auth-field { width: 100%; margin-bottom: 4px; }
    ::ng-deep .auth-field .mat-mdc-form-field-flex { background: #1a2238; border-radius: 10px; }
    ::ng-deep .auth-field .mat-mdc-form-field-label,
    ::ng-deep .auth-field input.mat-mdc-input-element { color: #e8edf6 !important; }
    .auth-error {
      color: #ff8b80; font-size: 13px; margin: 4px 0 12px;
      padding: 10px 12px; background: rgba(192,57,43,.18);
      border-radius: 8px; border: 1px solid rgba(192,57,43,.4);
    }
    .auth-submit {
      width: 100%; padding: 14px; border: none; border-radius: 12px;
      background: linear-gradient(135deg, #f5b841, #e89c1c);
      color: #0a1628; font-weight: 800; font-size: .95rem;
      cursor: pointer; margin-top: 10px;
      box-shadow: 0 8px 22px rgba(245,184,65,.4);
      transition: transform .18s ease, box-shadow .18s ease;
    }
    .auth-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(245,184,65,.55); }
    .auth-submit:disabled { opacity: .55; cursor: not-allowed; }
    .auth-link { display: block; text-align: center; margin-top: 18px; font-size: .82rem; color: #94a0b6; text-decoration: none; }
    .auth-link:hover { color: #f5b841; }
  `],
})
export class AdminLoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private authCtx = inject(AuthContextService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loading = false;
  error = '';

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const { email, password } = this.form.value;

    try {
      await this.auth.login(email!, password!);
      const ctx = await this.waitForContext();

      const isAdmin = ctx.isOrgAdmin || ctx.isGlobalAdmin
        || ctx['isAdmin'] === true
        || (Array.isArray(ctx.roles) && ctx.roles.some((r) =>
          ['admin', 'staff', 'super_admin', 'superAdmin', 'manager'].includes(r)));

      if (!isAdmin) {
        await this.auth.logout();
        this.error = "Ce compte n'a pas les droits d'administration. Utilisez la connexion utilisateur.";
        return;
      }

      const isSuper = ctx.isGlobalAdmin
        || (Array.isArray(ctx.roles) && (ctx.roles.includes('super_admin') || ctx.roles.includes('superAdmin')));
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl')
        || (isSuper ? '/super-admin' : '/admin');
      this.router.navigateByUrl(returnUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Échec de connexion';
      this.error = message;
    } finally {
      this.loading = false;
    }
  }

  /** Attend que AuthContextService ait fini de charger le profil (rôles inclus). */
  private async waitForContext(timeoutMs = 4000): Promise<ReturnType<AuthContextService['context']>> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const c = this.authCtx.context();
      if (!c.loading && c.uid) return c;
      await new Promise((r) => setTimeout(r, 80));
    }
    return this.authCtx.context();
  }
}
