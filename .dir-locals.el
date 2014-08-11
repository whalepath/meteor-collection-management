;; This file sets emacs variables for the project/directory

; indent 4 spaces
((js2-mode . ((js2-basic-offset . 4)
              ; allow indenting to correct level
              (js2-bounce-indent-p . t)
              ; wrap lines to 100 chars
              (fill-column . 100)))
 (html-mode . ((sgml-basic-offset . 4))))
