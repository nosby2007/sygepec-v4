import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaxService } from './tax.service';
import { TaxCase, TaxTicket } from './tax.models';

@Component({
 selector:'app-tax-dashboard',standalone:true,imports:[CommonModule,FormsModule],
 template:`
 <main class="tax"><header><h1>Perry Tax Pro</h1><p>Secure client case tracking · Tax preparation and e-file are performed externally.</p></header>
 <div class="notice">Pilot environment: do not submit SSNs, W-2s, 1099s or other real taxpayer documents until the security review is complete.</div>
 <p *ngIf="error" role="alert">{{error}}</p>
 <section><h2>My tax cases</h2><label>Tax year <input type="number" [(ngModel)]="year" min="2020" max="2100"></label> <button (click)="create()" [disabled]="busy">Start a case</button>
 <p *ngIf="!cases.length">No cases yet.</p>
 <article *ngFor="let c of cases"><strong>{{c.displayName}}</strong> · {{c.status}} <small>Year {{c.taxYear}}</small></article></section>
 <section><h2>Contact support</h2><label>Case <select [(ngModel)]="caseId"><option value="">General question</option><option *ngFor="let c of cases" [value]="c.id">{{c.displayName}}</option></select></label>
 <label>Subject <input [(ngModel)]="subject" maxlength="150"></label>
 <label>Message <textarea [(ngModel)]="message" maxlength="2000"></textarea></label>
 <button (click)="send()" [disabled]="busy || !subject.trim() || !message.trim()">Send request</button>
 <article *ngFor="let t of tickets"><strong>{{t.subject}}</strong> · {{t.status}}</article></section>
 </main>`,
 styles:[`.tax{max-width:1000px;margin:2rem auto;padding:1rem}.tax section{padding:1.5rem;border:1px solid #cbd5e1;border-radius:12px;margin:1rem 0}.tax label{display:block;margin:.75rem 0}.tax input,.tax select,.tax textarea{display:block;width:100%;max-width:420px;padding:.65rem}.tax button{padding:.7rem 1rem;border-radius:8px}.tax article{padding:1rem;border-bottom:1px solid #ddd}.notice{padding:1rem;border:1px solid #b45309;border-radius:8px}`]
})
export class TaxDashboardComponent implements OnInit {
 private api=inject(TaxService);
 cases:TaxCase[]=[];tickets:TaxTicket[]=[];year=new Date().getFullYear()-1;caseId='';subject='';message='';busy=false;error='';
 async ngOnInit(){await this.refresh();}
 async refresh(){try{[this.cases,this.tickets]=await Promise.all([this.api.myCases(),this.api.myTickets()]);}catch(e){this.error='Unable to load your records.';}}
 async create(){this.busy=true;this.error='';try{await this.api.createCase(this.year);await this.refresh();}catch(e){this.error='Could not create case.';}finally{this.busy=false;}}
 async send(){this.busy=true;this.error='';try{await this.api.createTicket(this.caseId,this.subject,this.message);this.subject='';this.message='';await this.refresh();}catch(e){this.error='Could not send support request.';}finally{this.busy=false;}}
}
