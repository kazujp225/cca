import * as React from "react"
import { cn } from "../../lib/utils"

const Tooltip = ({ children, content, className }) => {
  const [isVisible, setIsVisible] = React.useState(false)
  
  return (
    <div className="relative inline-flex">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div
          className={cn(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5",
            "bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-900",
            "text-xs font-medium rounded-md shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-100",
            "pointer-events-none z-50",
            className
          )}
        >
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
        </div>
      )}
    </div>
  )
}

export { Tooltip }