export type Topic = { id: string; title: string; hint: string };

/** Ten everyday conversation topics offered on the home page. */
export const TOPICS: Topic[] = [
  { id: "travel", title: "Travel", hint: "A trip you took or one you would like to take." },
  { id: "food", title: "Food", hint: "What you like to eat and cook, restaurants, recipes." },
  { id: "work", title: "Work", hint: "Your job or studies, a typical day, what you enjoy." },
  { id: "hobbies", title: "Hobbies", hint: "What you do in your free time and why you like it." },
  { id: "film", title: "A film you saw", hint: "Tell the story, the characters and what you thought." },
  { id: "weekend", title: "Plans for the weekend", hint: "What you are going to do and who with." },
  { id: "city", title: "Your city", hint: "Where you live, what to visit, what you would change." },
  { id: "technology", title: "Technology", hint: "Apps, gadgets and how they change daily life." },
  { id: "health", title: "Health and sport", hint: "Exercise, habits, staying healthy." },
  { id: "childhood", title: "A childhood memory", hint: "A moment you remember well from when you were small." },
];
