import { Routes } from '@angular/router';
import { TrainingHomeComponent } from './pages/training-home.component';
import { CoursesListComponent } from './pages/courses-list.component';
import { CourseReaderComponent } from './pages/course-reader.component';
import { LiveSessionsComponent } from './pages/live-sessions.component';

export const TRAINING_ROUTES: Routes = [
  {
    path: '',
    component: TrainingHomeComponent
  },
  {
    path: 'courses',
    component: CoursesListComponent
  },
  {
    path: 'courses/:courseId',
    component: CourseReaderComponent
  },
  {
    path: 'live',
    component: LiveSessionsComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
