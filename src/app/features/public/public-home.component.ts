import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `<div class="wrap"><h1>SYGEPEC</h1><p>Multi-tenant blueprint</p><a class="btn" routerLink="/auth/login">Login</a></div>`,
  styles: [`.wrap{max-width:900px;margin:60px auto;padding:16px;color:#111}.btn{display:inline-block;border-radius:10px;padding:10px 14px;font-weight:800;text-decoration:none;background:#111;color:#fff}`]
})
export class PublicHomeComponent {}
