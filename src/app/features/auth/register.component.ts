import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';

// Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

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
    MatIconModule
  ],
  template: `
    <div class="center">
      <mat-card class="card">
        <mat-card-title>Create Account</mat-card-title>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full">
              <mat-label>Full name</mat-label>
              <input matInput formControlName="displayName" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full">
              <mat-label>Email</mat-label>
              <input matInput formControlName="email" type="email" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full">
              <mat-label>Password</mat-label>
              <input matInput formControlName="password" type="password" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full">
              <mat-label>Organization ID (optional)</mat-label>
              <input matInput formControlName="tenantId" />
            </mat-form-field>

            <div *ngIf="error" class="error">{{ error }}</div>

            <button mat-flat-button color="primary" class="full" type="submit" [disabled]="form.invalid || loading">
              {{ loading ? 'Registering...' : 'Register' }}
            </button>

            <a routerLink="/auth/login" class="link">Already have an account? Sign in</a>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .center {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    .card {
      width: 380px;
      border-radius: 16px;
    }
    .full {
      width: 100%;
      margin-bottom: 12px;
    }
    .error {
      color: #b00020;
      font-size: 13px;
      margin-bottom: 12px;
    }
    .link {
      display: block;
      text-align: center;
      margin-top: 12px;
    }
  `]
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = false;
  error = '';

  form = this.fb.group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    tenantId: ['']
  });

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';

    const { displayName, email, password, tenantId } = this.form.value;
    try {
      await this.auth.register(email!, password!, displayName!, tenantId!);
      this.router.navigate(['/training']);
    } catch (err: any) {
      this.error = err.message || 'Registration failed';
    } finally {
      this.loading = false;
    }
  }
}
