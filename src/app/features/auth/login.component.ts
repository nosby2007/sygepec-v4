import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth-state.service';
import { AuthContextService } from '../../core/auth/auth-context.service';

// Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule
  ],
  template: `
    <div class="auth-bg">
      <div class="auth-card">

        <div class="auth-brand">
          <span class="auth-brand-mark">S</span>
          <div>
            <div class="auth-brand-name">SYGEPEC</div>
            <div class="auth-brand-sub">Votre passeport vers l'étranger</div>
          </div>
        </div>

        <h1 class="auth-title">Connexion</h1>
        <p class="auth-sub">Bienvenue ! Connectez-vous pour accéder à votre espace immigration.</p>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <mat-form-field appearance="outline" class="auth-field">
            <mat-label>Adresse e-mail</mat-label>
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
            {{ loading ? 'Connexion en cours...' : 'Se connecter' }}
          </button>

          <a routerLink="/auth/register" class="auth-link">Pas encore de compte ? Créer un compte →</a>
          <a routerLink="/auth/admin-login" class="auth-link auth-link-muted">Vous êtes administrateur ? Connexion réservée →</a>
        </form>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .auth-bg {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background:
        radial-gradient(ellipse at 20% 50%, rgba(30,99,214,.22), transparent 44%),
        radial-gradient(ellipse at 80% 15%, rgba(245,184,65,.14), transparent 40%),
        linear-gradient(145deg, #0a1628, #1b3a6b 54%, #123c69);
      padding: 24px;
    }
    .auth-card {
      width: 100%;
      max-width: 430px;
      background: #ffffff;
      border-radius: 22px;
      padding: 38px 34px 32px;
      box-shadow: 0 32px 72px rgba(0,0,0,.32);
    }
    .auth-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 26px;
    }
    .auth-brand-mark {
      width: 44px;
      height: 44px;
      border-radius: 11px;
      display: grid;
      place-items: center;
      background: #f5b841;
      color: #0a1628;
      font-weight: 900;
      font-size: 21px;
      font-family: 'Sora', 'Avenir Next', sans-serif;
      box-shadow: 0 4px 14px rgba(245,184,65,.42);
      text-decoration: none;
    }
    .auth-brand-name {
      font-weight: 800;
      font-size: 15px;
      color: #0a1628;
      font-family: 'Sora', 'Avenir Next', sans-serif;
      letter-spacing: .06em;
    }
    .auth-brand-sub {
      font-size: 11px;
      color: #6b7d94;
      margin-top: 2px;
    }
    .auth-title {
      margin: 0 0 6px;
      font-size: 1.75rem;
      font-weight: 800;
      color: #0a1628;
      font-family: 'Sora', 'Avenir Next', sans-serif;
      line-height: 1.2;
      letter-spacing: -.025em;
    }
    .auth-sub {
      margin: 0 0 22px;
      font-size: .88rem;
      color: #5e6b7a;
      line-height: 1.58;
    }
    .auth-field {
      width: 100%;
      margin-bottom: 4px;
    }
    .auth-error {
      color: #c0392b;
      font-size: 13px;
      margin: 2px 0 12px;
      padding: 9px 12px;
      background: rgba(192,57,43,.08);
      border-radius: 8px;
      border: 1px solid rgba(192,57,43,.16);
    }
    .auth-submit {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 12px;
      background: #f5b841;
      color: #0a1628;
      font-weight: 800;
      font-size: .92rem;
      cursor: pointer;
      margin-top: 8px;
      box-shadow: 0 6px 18px rgba(245,184,65,.36);
      font-family: inherit;
      letter-spacing: .01em;
      transition: background .18s ease, box-shadow .18s ease, transform .18s ease;
    }
    .auth-submit:hover:not(:disabled) {
      background: #f0a820;
      box-shadow: 0 10px 26px rgba(245,184,65,.5);
      transform: translateY(-2px);
    }
    .auth-submit:disabled {
      opacity: .6;
      cursor: not-allowed;
    }
    .auth-link {
      display: block;
      text-align: center;
      margin-top: 18px;
      font-size: .84rem;
      color: #1e63d6;
      font-weight: 600;
      text-decoration: none;
    }
    .auth-link:hover {
      color: #0a1628;
    }
    .auth-link-muted {
      color: #6b7d94;
      font-weight: 500;
      margin-top: 8px;
    }
    .auth-link-muted:hover { color: #c0392b; }
  `]
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private authCtx = inject(AuthContextService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loading = false;
  error = '';

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const { email, password } = this.form.value;

    try {
      await this.auth.login(email!, password!);

      // Bloquer les admins/staff sur la connexion utilisateur — ils doivent passer par /auth/admin-login
      const ctx = await this.waitForContext();
      const isAdmin = ctx.isOrgAdmin || ctx.isGlobalAdmin
        || ctx['isAdmin'] === true
        || (Array.isArray(ctx.roles) && ctx.roles.some((r: string) =>
          ['admin', 'staff', 'super_admin', 'superAdmin', 'manager'].includes(r)));
      if (isAdmin) {
        await this.auth.logout();
        this.error = "Compte administrateur détecté. Merci d'utiliser la connexion admin dédiée.";
        this.router.navigate(['/auth/admin-login']);
        return;
      }

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
      const hasDraft = this.route.snapshot.queryParamMap.get('draft') === '1';
      if (hasDraft && returnUrl === '/start-audit') {
        this.router.navigate(['/start-audit'], { queryParams: { resume: 1 } });
        return;
      }
      this.router.navigateByUrl(returnUrl);
    } catch (err: any) {
      this.error = err.message || 'Login failed';
    } finally {
      this.loading = false;
    }
  }

  private async waitForContext(timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const c = this.authCtx.context();
      if (!c.loading && c.uid) return c;
      await new Promise((r) => setTimeout(r, 80));
    }
    return this.authCtx.context();
  }
}
