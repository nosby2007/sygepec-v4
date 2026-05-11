import { inject } from '@angular/core';

import { collection, getDocs } from 'firebase/firestore';
import { FIRESTORE_DB } from './firebase/firebase.providers';

const db = inject(FIRESTORE_DB);
getDocs(collection(db, 'ping')).then(() => console.log('Firestore OK')).catch(console.error);
