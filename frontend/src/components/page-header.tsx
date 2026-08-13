type PageHeaderProps = {
  description: string
  title: string
}

export function PageHeader({ description, title }: PageHeaderProps) {
  return (
    <div>
      <h1 className="hidden text-2xl font-semibold tracking-tight md:block">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground md:mt-1">{description}</p>
    </div>
  )
}
