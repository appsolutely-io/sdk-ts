/** True when T is `any`, so a type test can refuse it. */
export type IsAny<T> = 0 extends 1 & T ? true : false;
