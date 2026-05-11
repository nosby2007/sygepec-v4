import { Component, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AiIntakeService, IntakeState } from '../../services/ai-intake.service';

@Component({
  standalone: true,
  selector: 'app-ai-intake-widget',
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-intake-widget.component.html',
  styleUrls: ['./ai-intake-widget.component.scss'],
})
export class AiIntakeWidgetComponent {
  private intake = inject(AiIntakeService);

  isOpen = signal(false);
  state = signal<IntakeState>(this.intake.restoreSession());
  userInput = signal('');
  isTyping = signal(false);

  readonly hasMessages = computed(() => this.state().messages.length > 0);
  readonly messages = computed(() => this.state().messages);
  readonly canLaunchAudit = computed(() => this.intake.canLaunchAudit(this.state()));

  toggleWidget() {
    const opening = !this.isOpen();
    this.isOpen.set(opening);

    if (opening && !this.hasMessages()) {
      // Start conversation
      setTimeout(() => {
        this.isTyping.set(true);
        setTimeout(() => {
          this.isTyping.set(false);
          this.state.set(this.intake.bootstrap());
        }, 800);
      }, 300);
    }
  }

  selectQuickReply(reply: string) {
    this.sendMessage(reply);
  }

  onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && this.userInput().trim()) {
      this.sendMessage(this.userInput().trim());
      this.userInput.set('');
    }
  }

  sendMessage(text: string) {
    if (!text.trim()) return;
    this.userInput.set('');

    this.isTyping.set(true);
    setTimeout(() => {
      this.isTyping.set(false);
      this.state.set(this.intake.answer(this.state(), text));
    }, 900);
  }
}
