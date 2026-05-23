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
import { AUTH_UI_STYLES } from './auth-ui.styles';

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
          <p class="auth-eyebrow">Secure candidate workspace</p>
          <h1>Reprenez votre dossier exactement la ou vous l'avez laisse.</h1>
          <p>
            Connectez-vous pour suivre votre readiness score, vos documents, vos demandes de
            service, vos opportunites internationales et les prochaines actions recommandees par
            SYGEPEC.
          </p>
          <div class="auth-proof" aria-label="Garanties du portail">
            <div>
              <strong>Dossier centralise</strong>
              <span>Audit, documents, checklist et suivi conseiller dans le meme espace.</span>
            </div>
            <div>
              <strong>Acces protege</strong>
              <span>Routes authentifiees, RBAC et separation des espaces client/admin.</span>
            </div>
            <div>
              <strong>Reprise intelligente</strong>
              <span>Votre brouillon d'audit reste disponible avant creation du dossier.</span>
            </div>
          </div>
        </section>

        <section class="auth-panel" aria-labelledby="login-title">
          <p class="panel-label">Client sign in</p>
          <h2 id="login-title" class="auth-title">Acceder a mon espace SYGEPEC</h2>
          <p class="auth-sub">
            Utilisez l'adresse email liee a votre audit ou a votre dossier. Les comptes admin
            passent par l'entree reservee.
          </p>

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

            <div class="form-row">
              <span class="mini-note">Connexion securisee par Firebase Auth.</span>
              <a routerLink="/auth/forgot-password" class="auth-link auth-link-muted">Mot de passe oublie ?</a>
            </div>

            <div *ngIf="error" class="auth-error">{{ error }}</div>

            <button class="auth-submit" type="submit" [disabled]="form.invalid || loading">
              {{ loading ? 'Connexion en cours...' : 'Se connecter' }}
            </button>

            <div class="auth-links">
              <a routerLink="/auth/register" [queryParams]="registerQueryParams()" class="auth-link">
                Nouveau candidat ? Creer un espace SYGEPEC
              </a>
              <a routerLink="/auth/admin-login" class="auth-link auth-link-muted">
                Connexion administrateur
              </a>
            </div>

            <p class="security-note">
              SYGEPEC organise et suit les procedures. La plateforme ne garantit pas l'obtention
              d'un visa, d'un emploi ou d'une approbation officielle.
            </p>
          </form>
        </section>
      </div>
    </main>
  `,
  styles: [AUTH_UI_STYLES]
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

  registerQueryParams(): Record<string, string | number> {
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
