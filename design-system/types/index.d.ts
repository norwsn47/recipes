import * as React from 'react'

/** Joins class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Green `primary` is the one main action per screen; the others are quieter. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  /** `md` is the default 44px-tall control; `lg` is bigger. */
  size?: 'md' | 'lg'
  /** Stretch to the full width of its container. */
  full?: boolean
}
/** A tappable button, at least 44px tall. Green is the only interactive colour in the system. */
export function Button(props: ButtonProps): React.JSX.Element

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
/** A single-line text field with a visible 3:1 border. Pair with `Field` for a label. */
export function Input(props: InputProps): React.JSX.Element

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
/** A multi-line text field with the same styling as `Input`. */
export function Textarea(props: TextareaProps): React.JSX.Element

export interface FieldProps {
  /** Visible label text. */
  label: React.ReactNode
  /** Optional helper text under the field. */
  hint?: React.ReactNode
  /** Error message. Shows in the error colour and marks the field invalid. */
  error?: React.ReactNode
  /** Exactly one `Input` or `Textarea`. */
  children: React.ReactElement
}
/** Wraps one Input or Textarea with a label, hint and error, wired up for screen readers. */
export function Field(props: FieldProps): React.JSX.Element

export interface SectionLabelProps extends React.HTMLAttributes<HTMLParagraphElement> {}
/** A small uppercase annotation label (the "micro" type register). */
export function SectionLabel(props: SectionLabelProps): React.JSX.Element

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}
/** A flat card: thin border, no shadow. For grouping content, not decoration. */
export function Card(props: CardProps): React.JSX.Element

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}
/** The heading inside a Card. */
export function CardTitle(props: CardTitleProps): React.JSX.Element

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** `highlight` (amber) is for small highlights only, never for actions. */
  variant?: 'neutral' | 'tint' | 'brand' | 'highlight' | 'destructive'
}
/** A small fully-rounded label. */
export function Badge(props: BadgeProps): React.JSX.Element

export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Errors are announced as alerts; other tones as polite status messages. */
  tone?: 'info' | 'highlight' | 'error'
}
/** A full-width status message. */
export function Banner(props: BannerProps): React.JSX.Element

export interface DialogProps {
  /** Whether the dialog is showing. */
  open: boolean
  /** Called on Escape or a backdrop click. */
  onClose: () => void
  /** The dialog heading. */
  title: React.ReactNode
  children?: React.ReactNode
}
/** A modal confirmation sheet (bottom sheet on phones) with focus trap, Escape close and focus return. */
export function Dialog(props: DialogProps): React.JSX.Element | null

export interface PageHeaderProps {
  /** Centred page title. It truncates rather than overlap the side buttons. */
  title: React.ReactNode
  /** Left slot, usually a back button. */
  back?: React.ReactNode
  /** Right slot, usually one small action. */
  right?: React.ReactNode
}
/** A three-slot page header: back, title, action. */
export function PageHeader(props: PageHeaderProps): React.JSX.Element

export interface OutbuildMarkProps {
  /** The app's name, shown in heavy weight. */
  appName: string
  className?: string
}
/** The "by Outbuild" attribution mark. Every Outbuild app shows it on its home screen. */
export function OutbuildMark(props: OutbuildMarkProps): React.JSX.Element
