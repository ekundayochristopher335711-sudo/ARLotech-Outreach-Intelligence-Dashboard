import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred.'): string {
  if (error instanceof Error) return error.message
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return fallback
}

export function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export function classToggle(
  value: boolean,
  truthy = 'block',
  falsy = 'hidden',
): string {
  return value ? truthy : falsy
}

export function classToggleStates(
  value: boolean,
  truthy: string,
  falsy: string,
): string {
  return value ? truthy : falsy
}

export function classSwitch(
  condition: boolean,
  truthy: string,
  falsy: string,
): string {
  return condition ? truthy : falsy
}
